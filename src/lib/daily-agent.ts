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

import { desc, eq, lt, lte, gt, and, isNotNull, notExists, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, clients, keywords, keywordRankings } from "@/db/schema";
import { getSetting, setSetting } from "./settings-store";
import { logActivity } from "./activity";
import {
  DAILY_REPORT_KEY,
  encodeSourceCounts,
  reasonParams,
  type StepNote,
  type StoredDailyReport,
} from "./daily-report";

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STALE_AUDIT_MS = 7 * 24 * 60 * 60 * 1000;

export type DailyAgentReport = {
  startedAt: Date;
  finishedAt: Date;
  steps: {
    name: string;
    ok: boolean;
    /** What the job found, as a message key (see lib/daily-report.ts). */
    note?: StepNote;
    /** The raw error, verbatim, when the job failed. */
    error?: string;
    durationMs: number;
  }[];
};

/** Builds a note: a message key under `nightlyJobs.notes` and its values. */
function note(key: string, params?: StepNote["params"]): StepNote {
  return params ? { key, params } : { key };
}

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
    // Keep the report. About twenty jobs run here every night, each
    // saying whether it worked and what it found — and all of it used to
    // be thrown away, only the timestamp above was stored. An install
    // where every job failed looked identical to one where none did.
    await persistDailyReport(report).catch(() => {
      // Never let bookkeeping fail the sweep that just succeeded.
    });
    return report;
  } finally {
    _tickInFlight = false;
  }
}

/**
 * Stores the sweep's result, job by job, for Settings → System health and
 * the install-health check. The note each job wrote is kept as it is:
 * reducing it to ok/failed would throw away the only useful part.
 */
export async function persistDailyReport(
  report: DailyAgentReport,
): Promise<StoredDailyReport> {
  const stored: StoredDailyReport = {
    at: report.finishedAt.toISOString(),
    durationMs: report.finishedAt.getTime() - report.startedAt.getTime(),
    steps: report.steps.map((s) => ({
      name: s.name,
      ok: s.ok,
      ...(s.note ? { note: s.note } : {}),
      ...(s.error ? { error: s.error } : {}),
      durationMs: s.durationMs,
    })),
  };
  await setSetting(DAILY_REPORT_KEY, stored);
  return stored;
}

/**
 * Runs every job once. Exported for scripts/nightly-jobs-check.ts, which
 * runs it against a COPY of the database and needs to leave out the jobs
 * that publish or send (`skip`). The scheduler goes through
 * tickDailyAgent, which skips nothing.
 */
export async function runDailyAgentBody(
  opts: { skip?: ReadonlySet<string> } = {},
): Promise<DailyAgentReport> {
  const startedAt = new Date();
  const steps: DailyAgentReport["steps"] = [];
  const runStep = (
    out: DailyAgentReport["steps"],
    name: string,
    fn: () => Promise<StepNote>,
  ) => (opts.skip?.has(name) ? Promise.resolve() : runOneStep(out, name, fn));

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
    messageFr: `Agent quotidien : ${steps.length} étape${steps.length === 1 ? "" : "s"} exécutée${steps.length === 1 ? "" : "s"} en ${finishedAt.getTime() - startedAt.getTime()} ms.`,
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

async function runOneStep(
  out: DailyAgentReport["steps"],
  name: string,
  fn: () => Promise<StepNote>,
): Promise<void> {
  const t = Date.now();
  try {
    const result = await Promise.race<StepNote>([
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
      note: result && typeof result.key === "string" ? result : undefined,
      durationMs: Date.now() - t,
    });
  } catch (err) {
    out.push({
      name,
      ok: false,
      error: (err as Error).message?.slice(0, 200),
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
async function sweepOrphanedAudits(): Promise<StepNote> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
  const orphans = await db
    .select({ id: audits.id })
    .from(audits)
    .where(and(eq(audits.status, "running"), lt(audits.startedAt, cutoff)));
  if (orphans.length === 0) return note("noOrphans");
  for (const o of orphans) {
    await db
      .update(audits)
      .set({
        status: "failed",
        completedAt: new Date(),
      })
      .where(eq(audits.id, o.id));
  }
  return note("orphansMarked", { count: orphans.length });
}

async function refreshStaleAudits(): Promise<StepNote> {
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

  if (staleClients.length === 0) return note("noStaleAudits");
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
  return note("reaudited", { count: started });
}

async function refreshNewsFeeds(): Promise<StepNote> {
  try {
    const { refreshFeeds } = await import("@/app/news/actions");
    const result = await refreshFeeds();
    await setSetting("news_runner.last_run", Date.now());
    return note("feeds", { feeds: result.feedsChecked, items: result.itemsAdded });
  } catch (err) {
    throw new Error((err as Error).message ?? "rss refresh failed");
  }
}

async function generateAiSuggestionsForAll(): Promise<StepNote> {
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
    return note("agentUnavailable");
  }
  return note("agentRan", { count });
}

async function sendMentionDigestStep(): Promise<StepNote> {
  try {
    const { sendWeeklyMentionDigests } = await import("./mention-digest");
    const r = await sendWeeklyMentionDigests();
    return note("digests", { sent: r.sent, ...reasonParams(r.reason) });
  } catch (err) {
    throw new Error((err as Error).message ?? "digest failed");
  }
}

async function monitorCompetitorsStep(): Promise<StepNote> {
  try {
    const { runCompetitorMonitor } = await import("./competitor-monitor");
    const r = await runCompetitorMonitor();
    return note("competitors", { checked: r.checked, changes: r.changes });
  } catch (err) {
    throw new Error((err as Error).message ?? "monitor failed");
  }
}

async function outreachReplyPollStep(): Promise<StepNote> {
  try {
    const { pollOutreachReplies } = await import("./outreach-reply-poll");
    const r = await pollOutreachReplies();
    return note("replies", { scanned: r.scanned, matched: r.matched, ...reasonParams(r.reason) });
  } catch (err) {
    throw new Error((err as Error).message ?? "reply poll failed");
  }
}

async function runDueTitleTestsStep(): Promise<StepNote> {
  try {
    const { runDueTitleTests } = await import("./title-test-runner");
    const r = await runDueTitleTests();
    return note("titleTests", { rotated: r.rotated, completed: r.completed });
  } catch (err) {
    throw new Error((err as Error).message ?? "title tests failed");
  }
}

async function runAnomalyDetectionStep(): Promise<StepNote> {
  try {
    const { runAnomalyDetection } = await import("./snapshot-anomalies");
    const r = await runAnomalyDetection();
    return note("anomalies", { flagged: r.flagged, checked: r.checked });
  } catch (err) {
    throw new Error((err as Error).message ?? "anomaly check failed");
  }
}

async function runScheduledLocalGridsStep(): Promise<StepNote> {
  try {
    const { runDueLocalGridSchedules } = await import("./local-grid-runner");
    const r = await runDueLocalGridSchedules();
    return note("localGrids", { ran: r.ran, scheduled: r.scheduled });
  } catch (err) {
    throw new Error((err as Error).message ?? "grid scheduler failed");
  }
}

async function runScheduleGenerationStep(): Promise<StepNote> {
  try {
    const { tickScheduleGeneration } = await import("./daily-automations");
    const r = await tickScheduleGeneration();
    return note("generated", { generated: r.generated, skipped: r.skipped });
  } catch (err) {
    throw new Error((err as Error).message ?? "schedule generation failed");
  }
}

async function runQueuePublishStep(): Promise<StepNote> {
  try {
    const { tickQueuePublish } = await import("./daily-automations");
    const r = await tickQueuePublish();
    return note("published", { published: r.published, failed: r.failed });
  } catch (err) {
    throw new Error((err as Error).message ?? "queue publish failed");
  }
}

async function lostLinkCheckStep(): Promise<StepNote> {
  try {
    const { runLostLinkCheck } = await import("./lost-link-check");
    const r = await runLostLinkCheck();
    return note("lostLinks", { checked: r.checked, lost: r.lost });
  } catch (err) {
    throw new Error((err as Error).message ?? "lost link check failed");
  }
}

async function runWatchlistAlertsStep(): Promise<StepNote> {
  try {
    const { runSnapshotAlerts } = await import("./snapshot-alerts");
    const r = await runSnapshotAlerts();
    return note("alerts", { alerts: r.alerts, scanned: r.scanned });
  } catch (err) {
    throw new Error((err as Error).message ?? "alerts failed");
  }
}

async function snapshotStaleClientsStep(): Promise<StepNote> {
  try {
    const { snapshotStaleClients } = await import("./client-snapshots");
    const r = await snapshotStaleClients();
    return note("snapshots", { taken: r.taken, scanned: r.scanned });
  } catch (err) {
    throw new Error((err as Error).message ?? "snapshot failed");
  }
}

async function runBrandMonitorForAll(): Promise<StepNote> {
  try {
    const { monitorAllClients } = await import("./brand-monitor");
    const r = await monitorAllClients();
    return note("brand", { clients: r.clients, added: r.added });
  } catch (err) {
    throw new Error((err as Error).message ?? "brand monitor failed");
  }
}

async function distillRecentFeedback(): Promise<StepNote> {
  try {
    const { distillPreferences } = await import("./ai-learn");
    const r = await distillPreferences();
    return note("rulesUpdated", { count: r.ruleCount });
  } catch {
    return note("noFeedback");
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

async function weeklyRankSweep(): Promise<StepNote> {
  // Cap to 30 to be polite to whatever we are asking for positions.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stale = await keywordsNeedingRankCheck(cutoff, 30);
  if (stale.length === 0) return note("ranksFresh", { days: 7 });

  const { checkRankAction } = await import("@/app/keywords/rank-actions");
  const { runRankBatch } = await import("./rank-batch");
  // A failed check returns { ok: false } — it does not throw — so the old
  // try/catch counted every blocked keyword as "checked". runRankBatch
  // counts the outcome, paces live searches and stops asking Google for
  // the rest of the sweep once it has blocked one keyword.
  const summary = await runRankBatch(stale, async (k, opts) => {
    const r = await checkRankAction(k.id, undefined, undefined, opts);
    return r.ok
      ? { ok: true, source: r.source, googleBlocked: r.googleBlocked }
      : { ok: false, googleBlocked: r.googleBlocked };
  });
  const { shutdownBrowser } = await import("./rank-checker");
  await shutdownBrowser().catch(() => {});

  const sources = encodeSourceCounts(summary.bySource);
  const googleSkipped = summary.googleAbandoned ? "yes" : "no";
  if (summary.checked === 0) {
    return note("ranksNone", { total: summary.total, googleSkipped });
  }
  return summary.failed > 0
    ? note("ranksPartial", {
        checked: summary.checked,
        total: summary.total,
        failed: summary.failed,
        sources,
        googleSkipped,
      })
    : note("ranksAll", { checked: summary.checked, sources, googleSkipped });
}

// ============== New auto-steps ==============

/**
 * Snapshot every client's /robots.txt daily. The library de-dupes by hash
 * — only stores when content actually changed. Catches accidental
 * Disallow: / disasters automatically.
 */
async function robotsSnapshotStep(): Promise<StepNote> {
  const all = await db.select({ id: clients.id, url: clients.url }).from(clients);
  if (all.length === 0) return note("noClients");
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
          messageFr: `Le fichier robots.txt a changé sur ${new URL(c.url).hostname}`,
          level: "warning",
          clientId: c.id,
          entityType: "robots",
        });
      } else unchanged += 1;
    } catch {
      failed += 1;
    }
  }
  return note("robots", { changed, unchanged, failed });
}

/**
 * Daily sitemap health probe — try to fetch /sitemap.xml for every client,
 * count entries, alert on parse failure or sudden drop.
 */
async function sitemapHealthStep(): Promise<StepNote> {
  const all = await db.select({ id: clients.id, url: clients.url }).from(clients);
  if (all.length === 0) return note("noClients");
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
          messageFr: `Le sitemap a renvoyé ${res.status} pour ${u.hostname}/sitemap.xml`,
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
          messageFr: `Le sitemap ne semble pas être du XML pour ${u.hostname}`,
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
  return note("sitemaps", { ok, broken });
}

/**
 * Daily traffic-drop check. For every client with GSC data, compare the
 * trailing 7-day clicks to the prior 7-day clicks. ≥10% drop = alert.
 */
async function trafficDropAlertStep(): Promise<StepNote> {
  const all = await db.select({ id: clients.id, url: clients.url, name: clients.name }).from(clients);
  if (all.length === 0) return note("noClients");
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
          messageFr: `Trafic en baisse de ${Math.abs(Math.round(dropPct))} % sur une semaine pour ${c.name} (${p} → ${r} clics)`,
          level: "warning",
          clientId: c.id,
          entityType: "traffic",
        });
      }
    } catch {
      // GSC may not be connected for this client
    }
  }
  return note("traffic", { checked, alerts: alerted });
}

/**
 * Weekly per-client AI audit refresh. Runs on Mondays. Skips clients where
 * the last AI audit is fresher than 6 days.
 */
async function weeklyAiAuditStep(): Promise<StepNote> {
  const all = await db.select({ id: clients.id, url: clients.url }).from(clients);
  if (all.length === 0) return note("noClients");
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
        // FIX: was orderBy(createdAt) which is ASC = oldest first. The
        // freshness check downstream wanted "most recent" — without desc,
        // it always saw an old audit and re-ran weekly, burning credits.
        .orderBy(desc(audits.createdAt))
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
  return note("aiAudits", { count: started });
}

/**
 * Weekly SERP-feature snapshot for every tracked keyword. Captures AIO,
 * featured snippet, PAA presence per keyword. Cap at 30/week to stay
 * within reasonable scrape volume.
 */
async function weeklySerpFeatureStep(): Promise<StepNote> {
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
  if (all.length === 0) return note("noKeywords");
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
  return note("serpSnapshots", { count: captured });
}
