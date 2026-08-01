/**
 * Lightweight uptime + TTFB pinger. Targets stored in DB; the user runs a
 * single "ping all now" check from the UI (or wires it into the existing
 * scheduler later).
 */

import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  uptimeTargets,
  uptimePings,
  type NewUptimePing,
  type UptimeTarget,
} from "@/db/schema";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export async function pingTarget(target: UptimeTarget): Promise<NewUptimePing> {
  const start = Date.now();
  let status: number | null = null;
  let ok = false;
  let error: string | null = null;

  try {
    const res = await fetch(target.url, {
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    status = res.status;
    if (target.expectedText) {
      const body = await res.text();
      ok =
        res.status === target.expectedStatus &&
        body.includes(target.expectedText);
      if (!ok && res.status === target.expectedStatus) {
        error = `Expected text "${target.expectedText.slice(0, 30)}" not found`;
      }
    } else {
      ok = res.status === target.expectedStatus;
      if (!ok) error = `Expected ${target.expectedStatus}, got ${res.status}`;
    }
  } catch (err) {
    error = (err as Error).message;
  }

  const latencyMs = Date.now() - start;
  return {
    targetId: target.id,
    status,
    latencyMs,
    ok,
    error,
  };
}

export async function pingAll(): Promise<{
  total: number;
  ok: number;
  failed: number;
}> {
  const targets = await db
    .select()
    .from(uptimeTargets)
    .where(eq(uptimeTargets.enabled, true));
  if (targets.length === 0) return { total: 0, ok: 0, failed: 0 };

  const results = await Promise.all(targets.map(pingTarget));
  if (results.length > 0) {
    await db.insert(uptimePings).values(results);
  }
  return {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}

export async function listTargets() {
  return await db
    .select()
    .from(uptimeTargets)
    .orderBy(uptimeTargets.createdAt);
}

export async function recentPings(targetId: number, limit = 50) {
  return await db
    .select()
    .from(uptimePings)
    .where(eq(uptimePings.targetId, targetId))
    .orderBy(desc(uptimePings.checkedAt))
    .limit(limit);
}

export async function targetSummary() {
  const targets = await db.select().from(uptimeTargets);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const out: {
    target: UptimeTarget;
    pings7d: number;
    okPct: number;
    avgLatency: number;
    lastChecked: Date | null;
    lastOk: boolean | null;
  }[] = [];
  for (const t of targets) {
    const pings = await db
      .select()
      .from(uptimePings)
      .where(eq(uptimePings.targetId, t.id));
    const recent = pings.filter((p) => p.checkedAt >= since);
    const okCount = recent.filter((p) => p.ok).length;
    const last = pings.sort(
      (a, b) => b.checkedAt.getTime() - a.checkedAt.getTime(),
    )[0];
    out.push({
      target: t,
      pings7d: recent.length,
      okPct: recent.length > 0 ? (okCount / recent.length) * 100 : 0,
      avgLatency:
        recent.length > 0
          ? Math.round(
              recent
                .filter((p) => p.latencyMs !== null)
                .reduce((s, p) => s + (p.latencyMs ?? 0), 0) /
                recent.filter((p) => p.latencyMs !== null).length,
            )
          : 0,
      lastChecked: last?.checkedAt ?? null,
      lastOk: last?.ok ?? null,
    });
  }
  return out;
}
