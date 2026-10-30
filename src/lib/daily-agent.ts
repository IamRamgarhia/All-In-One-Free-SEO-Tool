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
 *   5. **Rank checks** — a rotating daily share of keywords with no
 *      reading in 7 days, capped per day to keep Playwright load reasonable.
 *
 * Each step is wrapped so a failure in one doesn't block the next.
 */

import { desc, eq, lt, lte, gt, and, isNotNull, notExists, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, clients, keywords, keywordRankings } from "@/db/schema";
import { getSetting, setSetting } from "./settings-store";
import { logActivity } from "./activity";
import { coverageNote, takeTurn } from "./rotation";

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAILY_INTERVAL_MS;

/**
 * Keyword rank checks per daily run. Was 30 per WEEK across every client,
 * Mondays only — an agency tracking 300 keywords saw each one about every
 * ten weeks. Daily, with the 7-day freshness cutoff, a backlog drains at
 * this rate and then the step mostly finds nothing to do. Settable as
 * `automation.rank_sweep.daily_cap` for installs that get blocked.
 */
const DEFAULT_RANK_CHECKS_PER_DAY = 30;
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
    // Run first, THEN record. The previous order claimed the slot before
    // doing any work, so a process that died mid-run (a `docker stop`, a
    // STOP.cmd, an OOM) left `last_run` set to a batch that never
    // happened — and the entire daily sweep was skipped for 24h with no
    // record of it. `_tickInFlight` plus the scheduler's own started/
    // finished tracking already prevent overlap, so claiming early
    // bought nothing.
    const report = await runDailyAgentBody();
    await setSetting("daily_agent_runner.last_run", Date.now());
    return report;
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
  await runStep(steps, "automations.generate", runScheduleGenerationStep);
  await runStep(steps, "automations.publish", runQueuePublishStep);
  await runStep(steps, "planner.discover", plannerDiscoverStep);
  await runStep(steps, "rank.sweep", rankSweep);
  // The weekly block used to run only when this daily pass happened to
  // start on a Monday (UTC). A desktop install that isn't open on
  // Mondays never ran it, and because the daily pass drifts later each
  // day, even an always-on server skipped a Monday whenever the start
  // time crossed midnight. Now: whenever a week has passed since it last
  // completed, whatever the weekday.
  if (await weeklyBlockDue(startedAt)) {
    await runStep(steps, "ai_audit.weekly", weeklyAiAuditStep);
    await runStep(steps, "serp_features.weekly", weeklySerpFeatureStep);
    await setSetting("automation.weekly.last_run_at", startedAt.getTime()).catch(
      () => undefined,
    );
  }

  const finishedAt = new Date();
  await logActivity({
    kind: "report.generated",
    message: `Daily agent: ran ${steps.length} steps in ${finishedAt.getTime() - startedAt.getTime()}ms.`,
    level: steps.every((s) => s.ok) ? "success" : "warning",
  });

  return { startedAt, finishedAt, steps };
}

/**
 * Per-step hard timeout. Without it, any step that hangs (slow remote
 * SERP scrape, stalled AI provider, locked DB) freezes the entire
 * daily agent until the Node process is restarted. 5 minutes is long
 * enough for the heaviest legitimate step (weeklyRankSweep can chew
 * through hundreds of keywords) and short enough that a stuck step
 * doesn't lock out the rest of the chain.
 */
const STEP_TIMEOUT_MS = 5 * 60_000;

async function runStep(
  out: DailyAgentReport["steps"],
  name: string,
  fn: () => Promise<string | undefined | void>,
): Promise<void> {
  const t = Date.now();
  try {
    const result = await Promise.race<string | undefined | void>([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `step "${name}" exceeded ${STEP_TIMEOUT_MS / 1000}s timeout`,
              ),
            ),
          STEP_TIMEOUT_MS,
        ),
      ),
    ]);
    out.push({
      name,
      ok: true,
      detail: typeof result === "string" ? result : undefined,
      durationMs: Date.now() - t,
    });
  } catch (err) {
    out.push({
      name,
      ok: false,
      detail: (err as Error).message?.slice(0, 200),
      durationMs: Date.now() - t,
    });
    // Surface failures in /settings/health so a chronically broken
    // step is visible instead of just logged in the latest agent run.
    // Best-effort — logError swallows its own errors.
    try {
      const { logError } = await import("./error-log");
      await logError({
        source: "worker",
        context: `daily-agent: ${name}`,
        error: err,
      });
    } catch {
      // never bubble
    }
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
  let total = 0;
  try {
    const { runAgent } = await import("@/app/agent/actions");
    const everyone = await db.select({ id: clients.id }).from(clients);
    total = everyone.length;
    const all = await takeTurn("ai_suggestions", everyone, 20);
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
  return `ran agent for ${coverageNote(count, total, "clients")}`;
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

async function runScheduleGenerationStep(): Promise<string> {
  try {
    const { tickScheduleGeneration } = await import("./daily-automations");
    const r = await tickScheduleGeneration();
    return `${r.generated} generated, ${r.skipped} skipped`;
  } catch (err) {
    throw new Error((err as Error).message ?? "schedule generation failed");
  }
}

async function runQueuePublishStep(): Promise<string> {
  try {
    const { tickQueuePublish } = await import("./daily-automations");
    const r = await tickQueuePublish();
    return `${r.published} published, ${r.failed} failed`;
  } catch (err) {
    throw new Error((err as Error).message ?? "queue publish failed");
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

/**
 * Keywords that need a rank reading: never checked, or not in 7 days.
 *
 * Exported because the version this replaced could not check a new
 * keyword at all, and said nothing. It asked for rows where
 * `keyword_rankings.checked_at` was NOT NULL and older than the cutoff —
 * over a LEFT JOIN, so a keyword with no readings yet produced NULL and
 * was excluded. A keyword therefore had to already have a rank before it
 * could ever be given one.
 *
 * Measured on the install this was found on: 25 keywords tracked, 25
 * never checked, 0 rank readings ever recorded, and the step reporting
 * "no stale keywords" every run — a green tick for work that could not
 * happen.
 *
 * The join had a second fault. One row per reading means a keyword
 * checked this morning still matched if any older reading existed, so
 * busy keywords were re-checked forever while new ones starved. Asking
 * "is there a recent reading for this keyword" answers both, and returns
 * each keyword once.
 */
export async function weeklyBlockDue(now: Date): Promise<boolean> {
  const last = await getSetting<number>("automation.weekly.last_run_at").catch(
    () => null,
  );
  return typeof last !== "number" || now.getTime() - last >= WEEK_MS;
}

export function keywordsNeedingRankCheck(cutoff: Date, limit = 30) {
  return db
    .select({ id: keywords.id })
    .from(keywords)
    .where(
      notExists(
        db
          .select({ one: sql`1` })
          .from(keywordRankings)
          .where(
            and(
              eq(keywordRankings.keywordId, keywords.id),
              gt(keywordRankings.checkedAt, cutoff),
            ),
          ),
      ),
    )
    .limit(limit);
}

async function rankSweep(): Promise<string> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const capSetting = await getSetting<number>(
    "automation.rank_sweep.daily_cap",
  ).catch(() => null);
  const cap =
    typeof capSetting === "number" && capSetting > 0
      ? Math.floor(capSetting)
      : DEFAULT_RANK_CHECKS_PER_DAY;

  // Every stale keyword, then a rotating turn of `cap` of them. Taking
  // the first `cap` with no order meant keywords that could not be read
  // (blocked, so no ranking row is written) were picked again every run
  // and the rest were starved behind them.
  const stale = await keywordsNeedingRankCheck(cutoff, 100_000);
  if (stale.length === 0) return "every keyword has a reading from the last 7 days";
  const turn = await takeTurn("rank_sweep", stale, cap);

  const { checkRankAction } = await import("@/app/keywords/rank-actions");
  let done = 0;
  let failed = 0;
  for (const k of turn) {
    try {
      // checkRankAction reports failure by returning { ok: false }, not
      // by throwing — counting only throws reported a fully blocked
      // sweep as "checked 30 keywords".
      const r = await checkRankAction(k.id);
      if (r && typeof r === "object" && "ok" in r && r.ok === false) failed++;
      else done++;
    } catch {
      // Search engines block datacentre and residential IPs without
      // warning. Swallowing that and reporting only successes turns a
      // rank tracker that cannot see anything into one that looks idle.
      failed++;
    }
  }
  const backlog =
    stale.length > turn.length
      ? ` (${stale.length - turn.length} more due — they take their turn on later days)`
      : "";
  if (done === 0) {
    throw new Error(
      `could not check any of ${turn.length} keywords — the search page was unreadable (blocked, or the network refused)${backlog}`,
    );
  }
  return failed > 0
    ? `checked ${done} keywords, ${failed} could not be read${backlog}`
    : `checked ${done} keywords${backlog}`;
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
  const turn = await takeTurn("robots_snapshot", all, 30);
  let changed = 0,
    unchanged = 0,
    failed = 0;
  for (const c of turn) {
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
  return `${changed} changed, ${unchanged} unchanged, ${failed} failed — ${coverageNote(turn.length, all.length, "clients")}`;
}

/**
 * Daily sitemap health probe — try to fetch /sitemap.xml for every client,
 * count entries, alert on parse failure or sudden drop.
 */
/**
 * Google Keyword Planner, when Google Ads is connected: refresh each
 * client's ideas and start tracking the best few, so the keyword list
 * grows by itself until the client has a working set. Skipped quietly
 * when Ads is not connected.
 */
const PLANNER_TRACK_CAP = 40;
const PLANNER_NEW_PER_RUN = 3;

async function plannerDiscoverStep(): Promise<string> {
  const { getAdsStatus, discoverClientKeywords, trackKeywords } = await import(
    "./google-ads"
  );
  if (!(await getAdsStatus()).ready) return "Google Ads not connected";
  const all = await db.select({ id: clients.id }).from(clients);
  if (all.length === 0) return "no clients";
  const turn = await takeTurn("planner_discover", all, 10);
  let added = 0;
  for (const c of turn) {
    try {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(keywords)
        .where(eq(keywords.clientId, c.id));
      const ideas = await discoverClientKeywords(c.id, { refresh: true });
      if (n >= PLANNER_TRACK_CAP) continue;
      added += await trackKeywords(
        c.id,
        ideas.slice(0, PLANNER_NEW_PER_RUN).map((i) => i.text),
      );
    } catch (err) {
      console.warn(
        `[daily-agent] planner discover failed for client ${c.id}: ${(err as Error).message}`,
      );
    }
  }
  return `${turn.length} clients refreshed, ${added} keywords added`;
}

async function sitemapHealthStep(): Promise<string> {
  const all = await db.select({ id: clients.id, url: clients.url }).from(clients);
  if (all.length === 0) return "no clients";
  const turn = await takeTurn("sitemap_health", all, 30);
  let ok = 0,
    broken = 0;
  for (const c of turn) {
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
  return `${ok} ok, ${broken} broken — ${coverageNote(turn.length, all.length, "clients")}`;
}

/**
 * Daily traffic-drop check. For every client with GSC data, compare the
 * trailing 7-day clicks to the prior 7-day clicks. ≥10% drop = alert.
 *
 * The two windows must be the same length, which until 30 Oct 2026 they
 * were not: Search Console date ranges are inclusive, so ymd(9)..ymd(2)
 * is 8 days and ymd(16)..ymd(10) is 7. The recent half carried an extra
 * day of clicks, inflating it by 8/7, so a real 10% weekly drop came out
 * as +2.9% GROWTH and the alert only fired once a site had lost about
 * 21%. This step is the first item in the "morning health check" the
 * product claims to automate, and it was quietly missing half the drops
 * it promised to catch — the failure being that nothing appeared at all.
 */
async function trafficDropAlertStep(): Promise<string> {
  const all = await db.select({ id: clients.id, url: clients.url, name: clients.name }).from(clients);
  if (all.length === 0) return "no clients";
  const turn = await takeTurn("traffic_drop", all, 30);
  let alerted = 0,
    checked = 0;
  for (const c of turn) {
    try {
      const { fetchGscPerformance } = await import("./google-oauth");
      const today = new Date();
      const ymd = (offset: number) => {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - offset);
        return d.toISOString().slice(0, 10);
      };
      // Both windows 7 inclusive days, back to back, ending at ymd(2)
      // because Search Console data lags two to three days:
      //   recent  ymd(8) .. ymd(2)
      //   prior   ymd(15) .. ymd(9)
      const [recent, prev] = await Promise.all([
        fetchGscPerformance({
          siteUrl: c.url,
          startDate: ymd(8),
          endDate: ymd(2),
          dimensions: ["query"],
          rowLimit: 100,
          clientIdScope: c.id,
        }),
        fetchGscPerformance({
          siteUrl: c.url,
          startDate: ymd(15),
          endDate: ymd(9),
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
  return `${checked} checked, ${alerted} alerts — ${coverageNote(turn.length, all.length, "clients")}`;
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

  // Freshness first, cap second. The cap used to be applied to the first
  // eight clients before the freshness skip, so clients 9 and up were
  // never audited even in weeks when the first eight were all fresh.
  const due: typeof all = [];
  for (const c of all) {
    const [recent] = await db
      .select({ createdAt: audits.createdAt })
      .from(audits)
      .where(and(eq(audits.clientId, c.id), eq(audits.kind, "ai_full")))
      // Most recent first — ascending order once made every client look
      // stale and re-ran them weekly, burning credits.
      .orderBy(desc(audits.createdAt))
      .limit(1);
    if (recent?.createdAt && recent.createdAt >= cutoff) continue;
    due.push(c);
  }
  if (due.length === 0) return "every client has an AI audit from the last 6 days";

  // Cap 8/week to keep AI cost reasonable, rotating so all get a turn.
  const turn = await takeTurn("ai_audit_weekly", due, 8);
  let started = 0;
  for (const c of turn) {
    try {
      await runAiSiteAudit({ clientId: c.id, url: c.url });
      started += 1;
    } catch {
      // ignore one client's failure
    }
  }
  return `ran ${started} weekly AI audits — ${coverageNote(turn.length, due.length, "clients due")}`;
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
    .leftJoin(clients, eq(keywords.clientId, clients.id));
  if (all.length === 0) return "no keywords";
  const { captureSerpSnapshot } = await import("./serp-feature-tracker");
  // It was always the same first 30 keywords; now they take turns.
  const turn = await takeTurn("serp_features_weekly", all, 30);
  let captured = 0;
  for (const k of turn) {
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
  return `captured ${captured} SERP snapshots — ${coverageNote(turn.length, all.length, "keywords")}`;
}
