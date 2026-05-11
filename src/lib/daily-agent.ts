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

import { eq, lt, lte, and, isNotNull } from "drizzle-orm";
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

// Process-local lock so two concurrent tick calls don't overlap. SQLite
// is single-writer anyway but multiple in-flight tickDailyAgent calls
// would still duplicate work for ~50ms between the read + write.
let _tickInFlight = false;

export async function tickDailyAgent(): Promise<DailyAgentReport | null> {
  if (_tickInFlight) return null;
  _tickInFlight = true;
  try {
    const lastRun = await getSetting<number>(
      "daily_agent_runner.last_run",
    ).catch((err) => {
      console.error("[daily-agent] getSetting failed:", err);
      return null;
    });
    if (
      typeof lastRun === "number" &&
      Date.now() - lastRun < DAILY_INTERVAL_MS
    ) {
      return null;
    }
    // Claim the slot BEFORE doing work so a concurrent caller backs off.
    await setSetting("daily_agent_runner.last_run", Date.now());
    return await runDailyAgentBody();
  } finally {
    _tickInFlight = false;
  }
}

async function runDailyAgentBody(): Promise<DailyAgentReport> {
  const startedAt = new Date();
  const steps: DailyAgentReport["steps"] = [];

  await runStep(steps, "audits.sweepOrphans", sweepOrphanedAudits);
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
  await runStep(steps, "local_grid.scheduled", runScheduledLocalGridsStep);
  await runStep(steps, "outreach.reply_poll", outreachReplyPollStep);
  await runStep(steps, "metrics.anomaly", runAnomalyDetectionStep);
  await runStep(steps, "title_tests.rotate", runDueTitleTestsStep);
  await runStep(steps, "robots.snapshot", robotsSnapshotStep);
  await runStep(steps, "sitemap.health", sitemapHealthStep);
  await runStep(steps, "traffic.drop_alert", trafficDropAlertStep);
  if (startedAt.getUTCDay() === 1) {
    // Mondays only — heavier work
    await runStep(steps, "rank.weekly_sweep", weeklyRankSweep);
    await runStep(steps, "ai_audit.weekly", weeklyAiAuditStep);
    await runStep(steps, "serp_features.weekly", weeklySerpFeatureStep);
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

/**
 * Mark "running" audits that started >1h ago as failed. These are
 * orphans from server crashes / process restarts mid-audit. Without
 * this sweep the client detail page shows "in progress" forever and
 * the concurrency guard in runAuditForClient blocks new runs.
 */
async function sweepOrphanedAudits(): Promise<string> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
  const orphans = await db
    .select({ id: audits.id })
    .from(audits)
    .where(and(eq(audits.status, "running"), lt(audits.startedAt, cutoff)));
  if (orphans.length === 0) return "no orphans";
  for (const o of orphans) {
    await db
      .update(audits)
      .set({
        status: "failed",
        completedAt: new Date(),
      })
      .where(eq(audits.id, o.id));
  }
  return `marked ${orphans.length} orphaned audit(s) as failed`;
}

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

async function outreachReplyPollStep(): Promise<string> {
  try {
    const { pollOutreachReplies } = await import("./outreach-reply-poll");
    const r = await pollOutreachReplies();
    return `${r.scanned} scanned, ${r.matched} matched${r.reason ? ` (${r.reason})` : ""}`;
  } catch (err) {
    throw new Error((err as Error).message ?? "reply poll failed");
  }
}

async function runDueTitleTestsStep(): Promise<string> {
  try {
    const { runDueTitleTests } = await import("./title-test-runner");
    const r = await runDueTitleTests();
    return `${r.rotated} rotated, ${r.completed} completed`;
  } catch (err) {
    throw new Error((err as Error).message ?? "title tests failed");
  }
}

async function runAnomalyDetectionStep(): Promise<string> {
  try {
    const { runAnomalyDetection } = await import("./snapshot-anomalies");
    const r = await runAnomalyDetection();
    return `${r.flagged}/${r.checked} clients flagged`;
  } catch (err) {
    throw new Error((err as Error).message ?? "anomaly check failed");
  }
}

async function runScheduledLocalGridsStep(): Promise<string> {
  try {
    const { runDueLocalGridSchedules } = await import("./local-grid-runner");
    const r = await runDueLocalGridSchedules();
    return `${r.ran}/${r.scheduled} grid schedules ran`;
  } catch (err) {
    throw new Error((err as Error).message ?? "grid scheduler failed");
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

// ============== New auto-steps ==============

/**
 * Snapshot every client's /robots.txt daily. The library de-dupes by hash
 * — only stores when content actually changed. Catches accidental
 * Disallow: / disasters automatically.
 */
async function robotsSnapshotStep(): Promise<string> {
  const all = await db.select({ id: clients.id, url: clients.url }).from(clients);
  if (all.length === 0) return "no clients";
  const { snapshotRobots } = await import("./robots-snapshots");
  let changed = 0,
    unchanged = 0,
    failed = 0;
  for (const c of all.slice(0, 30)) {
    try {
      const r = await snapshotRobots(c.url);
      if (!r.ok) failed += 1;
      else if (r.changed) {
        changed += 1;
        await logActivity({
          kind: "page.changed",
          message: `robots.txt changed on ${new URL(c.url).hostname}`,
          level: "warning",
          clientId: c.id,
          entityType: "robots",
        });
      } else unchanged += 1;
    } catch {
      failed += 1;
    }
  }
  return `${changed} changed, ${unchanged} unchanged, ${failed} failed`;
}

/**
 * Daily sitemap health probe — try to fetch /sitemap.xml for every client,
 * count entries, alert on parse failure or sudden drop.
 */
async function sitemapHealthStep(): Promise<string> {
  const all = await db.select({ id: clients.id, url: clients.url }).from(clients);
  if (all.length === 0) return "no clients";
  let ok = 0,
    broken = 0;
  for (const c of all.slice(0, 30)) {
    try {
      const u = new URL(c.url);
      const sitemap = `${u.origin}/sitemap.xml`;
      const res = await fetch(sitemap, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; SeoToolBot/1.0)" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        broken += 1;
        await logActivity({
          kind: "page.changed",
          message: `Sitemap returned ${res.status} for ${u.hostname}/sitemap.xml`,
          level: "warning",
          clientId: c.id,
          entityType: "sitemap",
        });
        continue;
      }
      const body = await res.text();
      // Quick XML check
      if (!/<urlset|<sitemapindex/i.test(body)) {
        broken += 1;
        await logActivity({
          kind: "page.changed",
          message: `Sitemap doesn't look like XML for ${u.hostname}`,
          level: "warning",
          clientId: c.id,
          entityType: "sitemap",
        });
        continue;
      }
      ok += 1;
    } catch {
      broken += 1;
    }
  }
  return `${ok} ok, ${broken} broken`;
}

/**
 * Daily traffic-drop check. For every client with GSC data, compare the
 * trailing 7-day clicks to the prior 7-day clicks. ≥10% drop = alert.
 */
async function trafficDropAlertStep(): Promise<string> {
  const all = await db.select({ id: clients.id, url: clients.url, name: clients.name }).from(clients);
  if (all.length === 0) return "no clients";
  let alerted = 0,
    checked = 0;
  for (const c of all.slice(0, 30)) {
    try {
      const { fetchGscPerformance } = await import("./google-oauth");
      const today = new Date();
      const ymd = (offset: number) => {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - offset);
        return d.toISOString().slice(0, 10);
      };
      const [recent, prev] = await Promise.all([
        fetchGscPerformance({
          siteUrl: c.url,
          startDate: ymd(9),
          endDate: ymd(2),
          dimensions: ["query"],
          rowLimit: 100,
          clientIdScope: c.id,
        }),
        fetchGscPerformance({
          siteUrl: c.url,
          startDate: ymd(16),
          endDate: ymd(10),
          dimensions: ["query"],
          rowLimit: 100,
          clientIdScope: c.id,
        }),
      ]);
      const r = recent.reduce((s, x) => s + x.clicks, 0);
      const p = prev.reduce((s, x) => s + x.clicks, 0);
      checked += 1;
      if (p < 50) continue; // not enough data to be alarming
      const dropPct = ((r - p) / p) * 100;
      if (dropPct <= -10) {
        alerted += 1;
        await logActivity({
          kind: "rank.changed",
          message: `Traffic dropped ${Math.abs(Math.round(dropPct))}% WoW for ${c.name} (${p} → ${r} clicks)`,
          level: "warning",
          clientId: c.id,
          entityType: "traffic",
        });
      }
    } catch {
      // GSC may not be connected for this client
    }
  }
  return `${checked} checked, ${alerted} alerts`;
}

/**
 * Weekly per-client AI audit refresh. Runs on Mondays. Skips clients where
 * the last AI audit is fresher than 6 days.
 */
async function weeklyAiAuditStep(): Promise<string> {
  const all = await db.select({ id: clients.id, url: clients.url }).from(clients);
  if (all.length === 0) return "no clients";
  const { runAiSiteAudit } = await import("./ai-site-audit");
  const cutoff = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  let started = 0;
  for (const c of all.slice(0, 8)) {
    // Cap 8/week to keep AI cost reasonable
    try {
      // Look up most-recent ai_full audit
      const recent = await db
        .select()
        .from(audits)
        .where(and(eq(audits.clientId, c.id), eq(audits.kind, "ai_full")))
        .orderBy(audits.createdAt)
        .limit(1);
      if (
        recent.length > 0 &&
        recent[recent.length - 1].createdAt &&
        recent[recent.length - 1].createdAt >= cutoff
      ) {
        continue;
      }
      await runAiSiteAudit({ clientId: c.id, url: c.url });
      started += 1;
    } catch {
      // ignore one client's failure
    }
  }
  return `ran ${started} weekly AI audits`;
}

/**
 * Weekly SERP-feature snapshot for every tracked keyword. Captures AIO,
 * featured snippet, PAA presence per keyword. Cap at 30/week to stay
 * within reasonable scrape volume.
 */
async function weeklySerpFeatureStep(): Promise<string> {
  const all = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      country: keywords.country,
      clientId: keywords.clientId,
      clientUrl: clients.url,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .limit(30);
  if (all.length === 0) return "no keywords";
  const { captureSerpSnapshot } = await import("./serp-feature-tracker");
  let captured = 0;
  for (const k of all) {
    try {
      const r = await captureSerpSnapshot({
        query: k.query,
        country: k.country,
        ourDomain: k.clientUrl ?? undefined,
        keywordId: k.id,
      });
      if (r.ok) captured += 1;
    } catch {
      // ignore
    }
  }
  return `captured ${captured} SERP snapshots`;
}
