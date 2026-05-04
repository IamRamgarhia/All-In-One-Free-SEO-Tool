/**
 * Snapshot anomaly detection (z-score). Complements the static-threshold
 * watch-list alerts: instead of "fire if clicks dropped 25%", we look at
 * the rolling 8-week mean + std-dev for each metric and flag values that
 * are >1.8 standard deviations away.
 *
 * Catches genuinely weird movement that the static thresholds miss
 * (e.g. a small site whose entire run is tiny but whose normal week is
 * "5 ± 0.5 clicks", and this week's "1 click" is huge in z-space).
 *
 * Each flagged client gets one investigation task per run (deduped by
 * sourceRef so we don't spam if the anomaly persists across runs).
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  clientMetricSnapshots,
  clients,
  tasks,
  type ClientMetricSnapshot,
} from "@/db/schema";
import { logActivity } from "./activity";
import { getSetting, setSetting } from "./settings-store";
import { notify } from "./notifier";

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const Z_THRESHOLD = 1.8;
const MIN_HISTORY = 4;

type MetricKey = keyof Pick<
  ClientMetricSnapshot,
  | "organicClicks"
  | "ga4Sessions"
  | "ga4Conversions"
  | "top10Count"
  | "healthScore"
>;

const METRICS: { key: MetricKey; label: string; lowerIsBad: boolean }[] = [
  { key: "organicClicks", label: "Organic clicks", lowerIsBad: true },
  { key: "ga4Sessions", label: "GA4 sessions", lowerIsBad: true },
  { key: "ga4Conversions", label: "GA4 conversions", lowerIsBad: true },
  { key: "top10Count", label: "Top-10 keywords", lowerIsBad: true },
  { key: "healthScore", label: "Health score", lowerIsBad: true },
];

export async function runAnomalyDetection(): Promise<{
  checked: number;
  flagged: number;
}> {
  const last = await getSetting<number>("anomaly_runner.last_run").catch(
    () => null,
  );
  if (typeof last === "number" && Date.now() - last < RUN_INTERVAL_MS) {
    return { checked: 0, flagged: 0 };
  }
  await setSetting("anomaly_runner.last_run", Date.now()).catch(() => {});

  const all = await db.select({ id: clients.id, name: clients.name }).from(clients);
  let flagged = 0;

  for (const c of all) {
    const history = await db
      .select()
      .from(clientMetricSnapshots)
      .where(eq(clientMetricSnapshots.clientId, c.id))
      .orderBy(desc(clientMetricSnapshots.capturedAt))
      .limit(10);
    if (history.length < MIN_HISTORY + 1) continue;

    const [latest, ...prior] = history;
    const findings: {
      label: string;
      value: number;
      mean: number;
      stdev: number;
      z: number;
    }[] = [];

    for (const m of METRICS) {
      const val = latest[m.key];
      if (typeof val !== "number") continue;
      const samples = prior
        .map((s) => s[m.key])
        .filter((v): v is number => typeof v === "number");
      if (samples.length < MIN_HISTORY) continue;
      const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
      const variance =
        samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
      const stdev = Math.sqrt(variance);
      if (stdev < 0.5) continue; // ignore essentially-flat history
      const z = (val - mean) / stdev;
      const isBad = m.lowerIsBad ? z < -Z_THRESHOLD : z > Z_THRESHOLD;
      if (!isBad) continue;
      findings.push({ label: m.label, value: val, mean, stdev, z });
    }

    if (findings.length === 0) continue;

    flagged++;

    // Dedupe: skip if we already flagged this same anomaly within 7 days
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.clientId, c.id),
          eq(tasks.source, "snapshot_anomaly"),
          gte(tasks.createdAt, cutoff),
        ),
      )
      .limit(1);
    if (recent.length > 0) continue;

    const description = findings
      .map(
        (f) =>
          `${f.label}: ${f.value} (typical ${f.mean.toFixed(1)} ± ${f.stdev.toFixed(1)}, z=${f.z.toFixed(2)})`,
      )
      .join("\n");

    await db.insert(tasks).values({
      clientId: c.id,
      title: `Anomaly: ${findings.map((f) => f.label).join(", ")}`,
      description,
      whyItMatters:
        "Statistical anomaly — current value is more than 1.8 standard deviations from the rolling mean. Worth investigating before the static threshold catches up.",
      priority: "high",
      status: "todo",
      dueDate: new Date(Date.now() + 86_400_000),
      source: "snapshot_anomaly",
      sourceRef: `anomaly-${latest.id}`,
    });

    await logActivity({
      kind: "rank.changed",
      message: `Anomaly detected for ${c.name}: ${findings.map((f) => f.label).join(", ")}`,
      level: "warning",
      clientId: c.id,
      entityType: "snapshot_anomaly",
    });

    notify({
      title: `Anomaly — ${c.name}`,
      body: description,
      level: "warning",
      fields: findings.map((f) => ({
        label: f.label,
        value: `z=${f.z.toFixed(2)} · current ${f.value} vs mean ${f.mean.toFixed(1)}`,
      })),
    }).catch(() => {});
  }

  return { checked: all.length, flagged };
}
