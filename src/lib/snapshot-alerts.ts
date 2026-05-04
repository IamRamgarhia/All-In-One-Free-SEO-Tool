/**
 * Snapshot-driven watch-list alerts. After every weekly snapshot we
 * compare the new row to the prior row; if any metric crosses a
 * configurable threshold (default: 25% drop in clicks, 10-point health
 * drop, 3-position rank loss), we:
 *
 *   - log an activity entry
 *   - fire the workspace webhook (if any)
 *   - create a high-priority task asking the user to investigate
 *
 * The thresholds live in workspace settings so users can tune them.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  clientMetricSnapshots,
  clients,
  tasks,
  type ClientMetricSnapshot,
} from "@/db/schema";
import { logActivity } from "./activity";
import { getSetting } from "./settings-store";
import { notify } from "./notifier";

export type AlertThresholds = {
  clicksDropPct: number;
  healthDropPoints: number;
  top10DropCount: number;
  rankLossPositions: number;
};

const DEFAULTS: AlertThresholds = {
  clicksDropPct: 25,
  healthDropPoints: 10,
  top10DropCount: 3,
  rankLossPositions: 3,
};

export async function getThresholds(): Promise<AlertThresholds> {
  const raw = await getSetting<AlertThresholds>("alerts.thresholds");
  return { ...DEFAULTS, ...(raw ?? {}) };
}

/**
 * Walk every client's last two snapshots; emit alerts where the new
 * snapshot is meaningfully worse than the prior one.
 */
export async function runSnapshotAlerts(): Promise<{
  scanned: number;
  alerts: number;
}> {
  const thresholds = await getThresholds();

  const all = await db.select({ id: clients.id, name: clients.name }).from(clients);
  let alertsFired = 0;

  for (const c of all) {
    const recent = await db
      .select()
      .from(clientMetricSnapshots)
      .where(eq(clientMetricSnapshots.clientId, c.id))
      .orderBy(desc(clientMetricSnapshots.capturedAt))
      .limit(2);
    if (recent.length < 2) continue;
    const [latest, prior] = recent;

    const triggered = detectAlerts(latest, prior, thresholds);
    if (triggered.length === 0) continue;

    for (const t of triggered) {
      alertsFired++;
      await logActivity({
        kind: "rank.changed",
        message: `[${c.name}] ${t.summary}`,
        level: "warning",
        clientId: c.id,
        entityType: "snapshot_alert",
      });
      // Webhook (Slack-style) — best effort
      notify({
        title: `Watch-list alert: ${c.name}`,
        body: t.summary,
        level: "warning",
        fields: [
          { label: "Metric", value: t.metric },
          { label: "Prior", value: String(t.prior) },
          { label: "Current", value: String(t.current) },
        ],
      }).catch(() => {});
    }

    // Spawn a single investigation task summarising all triggered alerts
    const titleAlerts = triggered.map((t) => t.metric).join(", ");
    await db.insert(tasks).values({
      clientId: c.id,
      title: `Investigate: ${titleAlerts} regression`,
      description: triggered.map((t) => `• ${t.summary}`).join("\n"),
      whyItMatters:
        "The watch-list detector flagged a meaningful drop in this client's metrics. Catch it now while the cause is still recent.",
      priority: "high",
      status: "todo",
      dueDate: new Date(Date.now() + 86_400_000),
      source: "snapshot_alert",
      sourceRef: `alert-${latest.id}`,
    });
  }

  return { scanned: all.length, alerts: alertsFired };
}

type Alert = {
  metric: string;
  prior: number;
  current: number;
  summary: string;
};

function detectAlerts(
  cur: ClientMetricSnapshot,
  prior: ClientMetricSnapshot,
  t: AlertThresholds,
): Alert[] {
  const out: Alert[] = [];

  const dropPct = (curV: number | null, priorV: number | null) => {
    if (priorV === null || curV === null || priorV === 0) return null;
    return Math.round(((priorV - curV) / priorV) * 100);
  };

  const clicksPct = dropPct(cur.organicClicks, prior.organicClicks);
  if (clicksPct !== null && clicksPct >= t.clicksDropPct) {
    out.push({
      metric: "organic clicks",
      prior: prior.organicClicks ?? 0,
      current: cur.organicClicks ?? 0,
      summary: `Organic clicks dropped ${clicksPct}% (${prior.organicClicks} → ${cur.organicClicks}).`,
    });
  }

  if (
    typeof prior.healthScore === "number" &&
    typeof cur.healthScore === "number" &&
    prior.healthScore - cur.healthScore >= t.healthDropPoints
  ) {
    out.push({
      metric: "health score",
      prior: prior.healthScore,
      current: cur.healthScore,
      summary: `Health score dropped ${prior.healthScore - cur.healthScore} points (${prior.healthScore} → ${cur.healthScore}).`,
    });
  }

  if (
    typeof prior.top10Count === "number" &&
    typeof cur.top10Count === "number" &&
    prior.top10Count - cur.top10Count >= t.top10DropCount
  ) {
    out.push({
      metric: "top-10 keywords",
      prior: prior.top10Count,
      current: cur.top10Count,
      summary: `Lost ${prior.top10Count - cur.top10Count} top-10 keywords (${prior.top10Count} → ${cur.top10Count}).`,
    });
  }

  // avgRankX100 is stored × 100; compare in original units
  if (
    typeof prior.avgRankX100 === "number" &&
    typeof cur.avgRankX100 === "number"
  ) {
    const priorAvg = prior.avgRankX100 / 100;
    const curAvg = cur.avgRankX100 / 100;
    const lost = curAvg - priorAvg; // positive = ranks got worse
    if (lost >= t.rankLossPositions) {
      out.push({
        metric: "avg rank",
        prior: Math.round(priorAvg),
        current: Math.round(curAvg),
        summary: `Avg ranking position dropped ${lost.toFixed(1)} spots (${priorAvg.toFixed(1)} → ${curAvg.toFixed(1)}).`,
      });
    }
  }

  return out;
}
