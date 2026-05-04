/**
 * Daily AI agent runner. Once every 24h it walks every active client
 * and runs cheap, free-only automated work:
 *
 *   1. **Audit refresh** — only if last audit > 7 days old (so the
 *      morning briefing always reflects something recent).
 *   2. **Page-monitor sweep** — already its own runner; left alone.
 *   3. **News refresh** — pull every active RSS feed (uses src/lib/rss).
 *   4. **AI suggestions** — generate up to 3 fresh suggestions per
 *      client (titles, internal links, content ideas) using the
 *      configured AI provider.
 *   5. **Auto-trigger rank checks for striking-distance keywords** —
 *      on Mondays only, to keep playwright load reasonable.
 *
 * Each step is wrapped so a failure in one doesn't block the next.
 */

import { eq, lte, and, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, clients, keywords, keywordRankings } from "@/db/schema";
import { getSetting, setSetting } from "./settings-store";
import { logActivity } from "./activity";

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STALE_AUDIT_MS = 7 * 24 * 60 * 60 * 1000;

export type DailyAgentReport = {
  startedAt: Date;
  finishedAt: Date;
  steps: { name: string; ok: boolean; detail?: string; durationMs: number }[];
};

export async function tickDailyAgent(): Promise<DailyAgentReport | null> {
  const lastRun = await getSetting<number>("daily_agent_runner.last_run").catch(
    () => null,
  );
  if (
    typeof lastRun === "number" &&
    Date.now() - lastRun < DAILY_INTERVAL_MS
  ) {
    return null;
  }
  await setSetting("daily_agent_runner.last_run", Date.now());

  const startedAt = new Date();
  const steps: DailyAgentReport["steps"] = [];

  await runStep(steps, "audits.refreshStale", refreshStaleAudits);
  await runStep(steps, "rss.refresh", refreshNewsFeeds);
  await runStep(steps, "ai.suggestions", generateAiSuggestionsForAll);
  await runStep(steps, "ai.distill_preferences", distillRecentFeedback);
  await runStep(steps, "brand.monitor", runBrandMonitorForAll);
  await runStep(steps, "metrics.snapshot", snapshotStaleClientsStep);
  await runStep(steps, "metrics.alerts", runWatchlistAlertsStep);
  await runStep(steps, "mentions.digest", sendMentionDigestStep);
  await runStep(steps, "competitors.monitor", monitorCompetitorsStep);
  await runStep(steps, "links.lost_check", lostLinkCheckStep);
  if (startedAt.getUTCDay() === 1) {
    // Mondays only
    await runStep(steps, "rank.weekly_sweep", weeklyRankSweep);
  }

  const finishedAt = new Date();
  await logActivity({
    kind: "report.generated",
    message: `Daily agent: ran ${steps.length} steps in ${finishedAt.getTime() - startedAt.getTime()}ms.`,
    level: steps.every((s) => s.ok) ? "success" : "warning",
  });

  return { startedAt, finishedAt, steps };
}

async function runStep(
  out: DailyAgentReport["steps"],
  name: string,
  fn: () => Promise<string | undefined | void>,
): Promise<void> {
  const t = Date.now();
  try {
    const detail = await fn();
    out.push({
      name,
      ok: true,
      detail: typeof detail === "string" ? detail : undefined,
      durationMs: Date.now() - t,
    });
  } catch (err) {
    out.push({
      name,
      ok: false,
      detail: (err as Error).message?.slice(0, 200),
      durationMs: Date.now() - t,
    });
  }
}

// ============== Steps ==============

async function refreshStaleAudits(): Promise<string> {
  const cutoff = new Date(Date.now() - STALE_AUDIT_MS);
  const staleClients = await db
    .select({ id: clients.id, lastAudit: audits.completedAt })
    .from(clients)
    .leftJoin(audits, eq(audits.clientId, clients.id))
    .where(
      and(
        isNotNull(audits.completedAt),
        lte(audits.completedAt, cutoff),
      ),
    );

  if (staleClients.length === 0) return "no stale audits";
  // Cap how many we re-audit per day so we don't pummel sites
  const cap = Math.min(staleClients.length, 5);
  let started = 0;
  for (let i = 0; i < cap; i++) {
    const c = staleClients[i];
    if (!c.id) continue;
    try {
      const { runAuditForClient } = await import("@/app/audits/actions");
      await runAuditForClient(c.id);
      started++;
    } catch {
      // one failure shouldn't kill the loop
    }
  }
  return `re-audited ${started} stale clients`;
}

async function refreshNewsFeeds(): Promise<string> {
  try {
    const { refreshFeeds } = await import("@/app/news/actions");
    const result = await refreshFeeds();
    await setSetting("news_runner.last_run", Date.now());
    return `${result.feedsChecked} feeds fetched, ${result.itemsAdded} new items`;
  } catch (err) {
    throw new Error((err as Error).message ?? "rss refresh failed");
  }
}

async function generateAiSuggestionsForAll(): Promise<string> {
  let count = 0;
  try {
    const { runAgent } = await import("@/app/agent/actions");
    const all = await db.select({ id: clients.id }).from(clients).limit(20);
    for (const c of all) {
      try {
        await runAgent(c.id);
        count++;
      } catch {
        continue;
      }
    }
  } catch {
    return "agent module unavailable";
  }
  return `ran agent for ${count} clients`;
}

async function sendMentionDigestStep(): Promise<string> {
  try {
    const { sendWeeklyMentionDigests } = await import("./mention-digest");
    const r = await sendWeeklyMentionDigests();
    return `${r.sent} digest${r.sent === 1 ? "" : "s"} sent${r.reason ? ` (${r.reason})` : ""}`;
  } catch (err) {
    throw new Error((err as Error).message ?? "digest failed");
  }
}

async function monitorCompetitorsStep(): Promise<string> {
  try {
    const { runCompetitorMonitor } = await import("./competitor-monitor");
    const r = await runCompetitorMonitor();
    return `${r.checked} competitors checked, ${r.changes} changes`;
  } catch (err) {
    throw new Error((err as Error).message ?? "monitor failed");
  }
}

async function lostLinkCheckStep(): Promise<string> {
  try {
    const { runLostLinkCheck } = await import("./lost-link-check");
    const r = await runLostLinkCheck();
    return `${r.checked} backlinks checked, ${r.lost} flagged lost`;
  } catch (err) {
    throw new Error((err as Error).message ?? "lost link check failed");
  }
}

async function runWatchlistAlertsStep(): Promise<string> {
  try {
    const { runSnapshotAlerts } = await import("./snapshot-alerts");
    const r = await runSnapshotAlerts();
    return `${r.alerts} alert${r.alerts === 1 ? "" : "s"} across ${r.scanned} clients`;
  } catch (err) {
    throw new Error((err as Error).message ?? "alerts failed");
  }
}

async function snapshotStaleClientsStep(): Promise<string> {
  try {
    const { snapshotStaleClients } = await import("./client-snapshots");
    const r = await snapshotStaleClients();
    return `${r.taken}/${r.scanned} clients snapshotted`;
  } catch (err) {
    throw new Error((err as Error).message ?? "snapshot failed");
  }
}

async function runBrandMonitorForAll(): Promise<string> {
  try {
    const { monitorAllClients } = await import("./brand-monitor");
    const r = await monitorAllClients();
    return `${r.clients} clients scanned, ${r.added} new mentions`;
  } catch (err) {
    throw new Error((err as Error).message ?? "brand monitor failed");
  }
}

async function distillRecentFeedback(): Promise<string> {
  try {
    const { distillPreferences } = await import("./ai-learn");
    const r = await distillPreferences();
    return `${r.ruleCount} rules updated`;
  } catch {
    return "no recent feedback";
  }
}

async function weeklyRankSweep(): Promise<string> {
  // Pick keywords that haven't been checked in 7d, cap to 30 to be polite.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stale = await db
    .select({
      id: keywords.id,
    })
    .from(keywords)
    .leftJoin(keywordRankings, eq(keywordRankings.keywordId, keywords.id))
    .where(
      and(
        isNotNull(keywordRankings.checkedAt),
        lte(keywordRankings.checkedAt, cutoff),
      ),
    )
    .limit(30);
  if (stale.length === 0) return "no stale keywords";

  const { checkRankAction } = await import("@/app/keywords/rank-actions");
  let done = 0;
  for (const k of stale) {
    try {
      await checkRankAction(k.id);
      done++;
    } catch {
      continue;
    }
  }
  return `re-checked ${done} keywords`;
}
