/**
 * Is this install actually working, or merely running?
 *
 * WHY THIS EXISTS, measured on the maintainer's own install on
 * 19 Nov 2026:
 *
 *   - The WordPress plugin had not been reachable on the one live client
 *     for at least 68 days. dicecodes.com/wp-json/ serves rankmath,
 *     litespeed and wp/v2 — and no seo-tool/v1 at all. Every agent run
 *     noticed, and wrote "The WordPress plugin didn't respond
 *     (rest_no_route)" into a run summary nobody reads.
 *   - The connected Google account could see ZERO Search Console
 *     properties while a client asked for one, so every Search Console
 *     feature 403'd. Silently.
 *   - 14 safe fixes sat queued, the oldest 67.7 days old, 5 of them
 *     duplicates of each other.
 *   - 115 tasks sat at `todo`. Zero had ever been completed.
 *   - 24 keywords were tracked and 18 ranking rows existed in total,
 *     because every free rank source is blocked from that machine.
 *
 * Not one of those threw. Every page rendered. The product reported
 * success while doing almost nothing, which is this codebase's
 * recurring failure shape and the one its rules exist to catch:
 * prefer bugs that crash over bugs that lie.
 *
 * `/settings/health` already existed and already showed some of this.
 * That was not enough, and the 68 days are the proof: it is a settings
 * sub-page, and nobody opens a settings sub-page to find out whether
 * their tool is working. The answer has to arrive where people already
 * look.
 *
 * DESIGN
 *
 * One list of checks, consumed by every surface — the dashboard banner,
 * the health page, the digest. The fourth standing rule is "never add a
 * second hardcoded list of something that already exists", and three
 * surfaces each deciding for themselves what counts as broken is
 * exactly how they drift into disagreeing about whether the install is
 * fine.
 *
 * Checks that touch the network (the WP ping) are NOT run on a page
 * render. They run on a schedule, the result is stored, and surfaces
 * read the stored result with its timestamp, so a dashboard visit stays
 * fast and the banner can say how old its evidence is rather than
 * implying it is live.
 */

import { and, count, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  agentActions,
  agentRuns,
  audits,
  clients,
  keywordRankings,
  keywords,
  tasks,
} from "@/db/schema";
import { getClientWpCreds, pingWpBridge } from "./wp-bridge";
import { diagnoseGscProperties, describeGscIssue } from "./gsc-property-health";
import { isClosedTask } from "./task-status";

/**
 * How bad is it?
 *
 * - `broken`   something the user believes is connected is not. Always
 *              the result of evidence, never of an absence we failed to
 *              check.
 * - `stalled`  it works, and nothing is coming out of it. The queue
 *              that aged 68 days was here.
 * - `idle`     never set up. Not a fault — but worth saying once,
 *              because an unconfigured integration and a broken one
 *              look identical from the dashboard.
 */
export type HealthSeverity = "broken" | "stalled" | "idle";

export type HealthIssue = {
  /** Stable id, so a surface can dismiss or order without matching text. */
  id: string;
  severity: HealthSeverity;
  /** One line, plain language, no jargon. */
  title: string;
  /**
   * What we actually observed. This is the field that stops the banner
   * being another vague warning: "no route was found matching the URL"
   * is actionable, "integration unhealthy" is not.
   */
  evidence: string;
  /** Where to go to fix it. */
  fixHref: string;
  fixLabel: string;
  /** Which client, when the problem is per-client. */
  clientId?: number;
  clientName?: string;
};

export type InstallHealth = {
  issues: HealthIssue[];
  /** When these checks ran. Null when they never have. */
  checkedAt: Date | null;
  /** True while no check has ever run, so a surface can say so. */
  neverChecked: boolean;
};

/** Ordered worst-first, so a surface can take the top N honestly. */
const SEVERITY_ORDER: Record<HealthSeverity, number> = {
  broken: 0,
  stalled: 1,
  idle: 2,
};

export function sortIssues(issues: HealthIssue[]): HealthIssue[] {
  return [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

/** A fix queued longer than this is not "pending", it is forgotten. */
const STALE_QUEUE_DAYS = 7;
/** Long enough to be a real pattern rather than a quiet fortnight. */
const NO_COMPLETION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How recent a rank reading has to be to count as current.
 *
 * The sweep aims to re-check every keyword at least weekly, so 14 days
 * is two full rotations — long enough that a keyword mid-rotation is not
 * reported as missing, short enough that a persistently blocked one is.
 */
const RANK_WINDOW_DAYS = 14;

/**
 * Run every check. Hits the network for each client with WordPress
 * configured, so call this from the scheduler, not from a page.
 *
 * Every check is wrapped: a check that throws must not stop the others
 * from reporting. A health report that fails to render because one
 * integration is unreachable is worse than useless — unreachable
 * integrations are the entire point.
 */
export async function runHealthChecks(): Promise<HealthIssue[]> {
  const results = await Promise.all([
    safe(checkWordPressBridges),
    safe(checkSearchConsole),
    safe(checkStaleFixQueue),
    safe(checkNothingCompleted),
    safe(checkRankData),
    safe(checkClientsNeverAudited),
    safe(checkLatestAuditFailed),
  ]);
  return sortIssues(results.flat());
}

async function safe(
  fn: () => Promise<HealthIssue[]>,
): Promise<HealthIssue[]> {
  try {
    return await fn();
  } catch (err) {
    // Reported rather than swallowed: a check that cannot run is itself
    // worth knowing about, and silently returning [] would read as "all
    // clear".
    return [
      {
        id: `check_failed_${fn.name || "unknown"}`,
        severity: "stalled",
        title: "An install check could not run",
        evidence: `${fn.name || "a check"} threw: ${(err as Error).message}`,
        fixHref: "/settings/health",
        fixLabel: "Open system health",
      },
    ];
  }
}

/**
 * The one that mattered most. A client with `wpEndpoint` set believes
 * its site is writable; if the plugin is gone, every fix the agent
 * plans has nowhere to go, and the agent will keep planning them.
 */
async function checkWordPressBridges(): Promise<HealthIssue[]> {
  const rows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(isNotNull(clients.wpEndpoint));

  const out: HealthIssue[] = [];
  for (const c of rows) {
    const creds = await getClientWpCreds(c.id).catch(() => null);
    if (!creds) {
      out.push({
        id: `wp_no_creds_${c.id}`,
        severity: "broken",
        title: `${c.name}: WordPress connection is incomplete`,
        evidence:
          "An endpoint is saved but the application password is missing, " +
          "so nothing can be written to the site.",
        fixHref: `/clients/${c.id}`,
        fixLabel: "Fix the connection",
        clientId: c.id,
        clientName: c.name,
      });
      continue;
    }
    const ping = await pingWpBridge(creds);
    if (!ping.ok) {
      out.push({
        id: `wp_unreachable_${c.id}`,
        severity: "broken",
        title: `${c.name}: the WordPress plugin is not responding`,
        // The raw error, deliberately. "rest_no_route" tells someone who
        // knows WordPress that the plugin is not active — a paraphrase
        // would lose exactly the detail that identifies the problem.
        evidence:
          `${creds.endpoint} answered: ${ping.error ?? "no response"}. ` +
          `If this says "rest_no_route", the companion plugin is not ` +
          `installed or not activated on the site.`,
        fixHref: `/clients/${c.id}`,
        fixLabel: "Check the connection",
        clientId: c.id,
        clientName: c.name,
      });
    }
  }
  return out;
}

/**
 * Reuses diagnoseGscProperties rather than re-deriving the comparison —
 * it already distinguishes "no property set" from "set to one this
 * account cannot read", and the second is the silent 403.
 */
async function checkSearchConsole(): Promise<HealthIssue[]> {
  const { listGscProperties } = await import("./google-oauth");
  const available = await listGscProperties().catch(() => null);
  // Null means we could not ask Google at all — which is a different
  // problem from "the account has no properties", and claiming the
  // latter would be a guess.
  if (available === null) return [];

  const rows = await db
    .select({ id: clients.id, name: clients.name, gscProperty: clients.gscProperty })
    .from(clients);

  // `health.issues` is already only the clients whose property the
  // account cannot read — clients with nothing set are counted
  // separately as `unsetCount` and are not a fault. No filter needed,
  // and filtering on a field name that does not exist was how the first
  // version of this failed to compile.
  const health = diagnoseGscProperties(rows, available);
  return health.issues.map((i) => ({
    id: `gsc_${i.reason}_${i.clientId}`,
    severity: "broken" as const,
    title: `${i.clientName}: Search Console data is unavailable`,
    evidence: describeGscIssue(i),
    fixHref: "/settings/health",
    fixLabel: "See Search Console status",
    clientId: i.clientId,
    clientName: i.clientName,
  }));
}

/**
 * Fixes the agent wrote, reviewed as safe, and left waiting.
 *
 * Counted in days rather than shown as a bare number because "14
 * pending" reads as a healthy backlog and "oldest has waited 68 days"
 * does not.
 */
async function checkStaleFixQueue(): Promise<HealthIssue[]> {
  const cutoff = new Date(Date.now() - STALE_QUEUE_DAYS * DAY_MS);
  const [row] = await db
    .select({
      n: count(),
      oldest: sql<number>`min(${agentActions.createdAt})`,
    })
    .from(agentActions)
    .where(
      and(eq(agentActions.status, "queued"), lt(agentActions.createdAt, cutoff)),
    );

  const n = Number(row?.n ?? 0);
  if (n === 0) return [];

  // Stored as unix seconds; ×1000 to compare against Date.now(). Getting
  // this wrong reads as "waited 0 days", which is the opposite of the
  // point.
  const oldestMs = row?.oldest ? Number(row.oldest) * 1000 : Date.now();
  const days = Math.floor((Date.now() - oldestMs) / DAY_MS);

  return [
    {
      id: "fix_queue_stale",
      severity: "stalled",
      title: `${n} approved fix${n === 1 ? "" : "es"} waiting to be applied`,
      evidence:
        `The oldest has waited ${days} day${days === 1 ? "" : "s"}. ` +
        `These are changes the agent judged safe and is holding for your ` +
        `approval — nothing happens to them on their own.`,
      fixHref: "/agent",
      fixLabel: "Review and apply",
    },
  ];
}

/**
 * The install-level symptom: work goes in, nothing comes out.
 *
 * Deliberately not "the agent applied nothing" — a user who works by
 * hand and ticks tasks off is fine. This fires when BOTH are true:
 * there is open work, and nothing has closed in a month.
 */
async function checkNothingCompleted(): Promise<HealthIssue[]> {
  const since = new Date(Date.now() - NO_COMPLETION_DAYS * DAY_MS);

  const allTasks = await db
    .select({ status: tasks.status, updatedAt: tasks.updatedAt })
    .from(tasks);
  if (allTasks.length === 0) return [];

  const open = allTasks.filter((t) => !isClosedTask(t.status)).length;
  const closedRecently = allTasks.filter(
    (t) =>
      isClosedTask(t.status) &&
      t.updatedAt instanceof Date &&
      t.updatedAt >= since,
  ).length;

  if (open === 0 || closedRecently > 0) return [];

  const [applied] = await db
    .select({ n: count() })
    .from(agentActions)
    .where(eq(agentActions.status, "verified"));
  const [runs] = await db.select({ n: count() }).from(agentRuns);

  return [
    {
      id: "nothing_completed",
      severity: "stalled",
      title: `${open} open task${open === 1 ? "" : "s"}, and nothing finished in ${NO_COMPLETION_DAYS} days`,
      evidence:
        `${Number(runs?.n ?? 0)} agent run${Number(runs?.n ?? 0) === 1 ? "" : "s"} have happened and ` +
        `${Number(applied?.n ?? 0)} change${Number(applied?.n ?? 0) === 1 ? " has" : "s have"} been applied and ` +
        `verified. Finding work is not the same as doing it.`,
      fixHref: "/agent/autopilot",
      fixLabel: "Set what the agent may do",
    },
  ];
}

/**
 * Keywords tracked with nowhere to check them from.
 *
 * Measured on this machine: Google served a JS interstitial, DuckDuckGo
 * a CAPTCHA, Bing and Startpage empty shells. So "tracking" 24 keywords
 * produced 18 data points in total — a number nobody would guess from a
 * keywords page that lists 24 rows.
 */
async function checkRankData(): Promise<HealthIssue[]> {
  const [kw] = await db.select({ n: count() }).from(keywords);
  const tracked = Number(kw?.n ?? 0);
  if (tracked === 0) return [];

  const since = new Date(Date.now() - RANK_WINDOW_DAYS * DAY_MS);

  // COVERAGE, not existence.
  //
  // The first version counted rows and returned early if ANY row existed
  // in the window. Measured on this install: 24 keywords tracked, 16 with
  // a reading in the last 14 days, and EIGHT that have never been checked
  // at all — and this check said nothing, because one successful reading
  // suppressed it. A single keyword succeeding would have hidden
  // twenty-three failing ones.
  //
  // That is the same silent-wrong-answer shape this module exists to
  // catch, in the module itself. Counting distinct keywords is the
  // measure a user cares about: how much of my list actually has current
  // data.
  const covered = await db
    .selectDistinct({ keywordId: keywordRankings.keywordId })
    .from(keywordRankings)
    .where(gte(keywordRankings.checkedAt, since));
  const current = covered.length;

  const everChecked = await db
    .selectDistinct({ keywordId: keywordRankings.keywordId })
    .from(keywordRankings);
  const neverChecked = tracked - everChecked.length;

  const pct = Math.round((current / tracked) * 100);
  // 80% allows for a keyword or two legitimately mid-rotation. Below
  // that, the rank graphs are mostly empty and nothing else says so.
  if (pct >= 80 && neverChecked === 0) return [];

  const sourceHelp =
    "Search Console is the best source and is free for sites you own. " +
    "Failing that, rank checks need a self-hosted SearXNG (one command: " +
    "docker compose --profile searxng up -d) or a Brave key — Google and " +
    "Bing block direct automated requests, so the headless browser " +
    "fallback returns a CAPTCHA rather than results.";

  return [
    {
      id: "rank_coverage_low",
      severity: "stalled",
      title:
        current === 0
          ? `${tracked} keyword${tracked === 1 ? "" : "s"} tracked, no positions recorded in ${RANK_WINDOW_DAYS} days`
          : `Only ${current} of ${tracked} tracked keywords have a recent position`,
      evidence:
        (current === 0
          ? ""
          : `${pct}% of your list has a reading from the last ${RANK_WINDOW_DAYS} days` +
            (neverChecked > 0
              ? `, and ${neverChecked} ${neverChecked === 1 ? "keyword has" : "keywords have"} never been checked at all`
              : "") +
            ". The rest show an empty graph rather than an error. ") + sourceHelp,
      fixHref: "/settings",
      fixLabel: "Set up a rank source",
    },
  ];
}

/**
 * A client that has never been crawled.
 *
 * `idle` rather than `broken`: nothing is wrong, but every agent run for
 * that client reports "nothing to do", which reads as "your site is
 * fine" when it means "we have never looked".
 */
async function checkClientsNeverAudited(): Promise<HealthIssue[]> {
  // Two plain queries joined in memory, NOT a correlated subquery.
  //
  // The first version used
  //   sql`(select count(*) from ${audits} where ${audits.clientId} = ${clients.id})`
  // which compiled, ran, threw nothing, and returned 0 for every client.
  // It reported all three clients on this install as "never audited"
  // while they had 8, 2 and 12 completed audits holding 349, 27 and 413
  // issues between them. A health check that invents problems is worse
  // than no health check: it trains people to ignore the banner, which
  // is the one thing this module cannot afford.
  //
  // Caught by running it against the real database. It would have passed
  // any test that only asserted the shape of the result.
  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const counted = await db
    .select({ clientId: audits.clientId, n: count() })
    .from(audits)
    .where(eq(audits.status, "completed"))
    .groupBy(audits.clientId);

  const completedByClient = new Map(
    counted.map((r) => [r.clientId, Number(r.n)]),
  );

  return rows
    .filter((r) => (completedByClient.get(r.id) ?? 0) === 0)
    .map((r) => ({
      id: `never_audited_${r.id}`,
      severity: "idle" as const,
      title: `${r.name} has never been audited successfully`,
      evidence:
        "Every agent run for this client reports nothing to do, because " +
        "there are no findings to act on yet.",
      fixHref: `/clients/${r.id}`,
      fixLabel: "Run the first audit",
      clientId: r.id,
      clientName: r.name,
    }));
}

/**
 * The newest audit for a client failed.
 *
 * Found while fixing the check above: one client's most recent audit had
 * failed that same day, behind an older successful one. Nothing said so
 * anywhere — the client page shows the last *completed* audit, so a
 * crawl that keeps failing looks exactly like a site that has stopped
 * changing. The data silently ages while the UI looks healthy.
 */
async function checkLatestAuditFailed(): Promise<HealthIssue[]> {
  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const out: HealthIssue[] = [];
  for (const c of rows) {
    const [latest] = await db
      .select({
        status: audits.status,
        createdAt: audits.createdAt,
        summary: audits.summary,
      })
      .from(audits)
      .where(eq(audits.clientId, c.id))
      .orderBy(desc(audits.createdAt))
      .limit(1);
    if (!latest || latest.status !== "failed") continue;

    const when =
      latest.createdAt instanceof Date
        ? latest.createdAt.toISOString().slice(0, 10)
        : "recently";
    out.push({
      id: `audit_failed_${c.id}`,
      severity: "broken",
      title: `${c.name}: the most recent crawl failed`,
      evidence:
        `The last audit attempt (${when}) did not complete` +
        `${latest.summary ? `: ${String(latest.summary).slice(0, 160)}` : "."} ` +
        `The client page still shows the last audit that worked, so the ` +
        `findings you are looking at are older than they appear.`,
      fixHref: `/clients/${c.id}`,
      fixLabel: "Re-run the audit",
      clientId: c.id,
      clientName: c.name,
    });
  }
  return out;
}

/**
 * The most recent stored result, for surfaces that must not make network
 * calls. Returns `neverChecked` rather than an empty all-clear, because
 * "we have not looked" and "nothing is wrong" must never render the
 * same — that equivalence is the bug this whole module is about.
 */
export async function readStoredHealth(): Promise<InstallHealth> {
  const { getSetting } = await import("./settings-store");
  const raw = await getSetting<{ at: string; issues: HealthIssue[] }>(
    "install_health.last",
  );
  if (!raw || !Array.isArray(raw.issues)) {
    return { issues: [], checkedAt: null, neverChecked: true };
  }
  const at = Date.parse(raw.at);
  return {
    issues: sortIssues(raw.issues),
    checkedAt: Number.isFinite(at) ? new Date(at) : null,
    neverChecked: false,
  };
}

/** Runs the checks and stores the result for the cheap readers. */
export async function refreshStoredHealth(): Promise<InstallHealth> {
  const { setSetting } = await import("./settings-store");
  const issues = await runHealthChecks();
  const at = new Date();
  await setSetting("install_health.last", { at: at.toISOString(), issues });
  return { issues, checkedAt: at, neverChecked: false };
}

/** Worst severity present, for a banner that has to pick one colour. */
export function worstSeverity(issues: HealthIssue[]): HealthSeverity | null {
  if (issues.length === 0) return null;
  return sortIssues(issues)[0].severity;
}

/**
 * One sentence for the digest and the banner headline.
 *
 * Leads with the count of genuinely broken things, because "3 problems"
 * where all three are "never audited" deserves a different tone from
 * one where a site has been unwritable for two months.
 */
export function summariseHealth(health: InstallHealth): string | null {
  if (health.neverChecked) return null;
  const broken = health.issues.filter((i) => i.severity === "broken").length;
  const stalled = health.issues.filter((i) => i.severity === "stalled").length;
  if (broken === 0 && stalled === 0) return null;
  const parts: string[] = [];
  if (broken > 0)
    parts.push(`${broken} connection${broken === 1 ? "" : "s"} not working`);
  if (stalled > 0)
    parts.push(`${stalled} thing${stalled === 1 ? "" : "s"} stalled`);
  return parts.join(", ");
}
