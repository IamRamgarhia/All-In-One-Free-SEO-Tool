/**
 * Is this install actually working, or merely running?
 *
 * Ported from the upstream project (feat(health): say out loud when this
 * install has stopped working). Upstream measured it on the maintainer's
 * own install: a WordPress plugin that had stopped answering for weeks,
 * a Google account that could read none of the Search Console properties
 * its clients asked for, safe fixes queued for months, tasks never
 * completed, keywords tracked with no position recorded. Not one of
 * those threw. Every page rendered. The app knew, and wrote it into run
 * summaries and a settings sub-page nobody opens.
 *
 * The answer has to arrive where people already look: the dashboard.
 *
 * DESIGN
 *
 * One list of checks, consumed by every surface — the dashboard banner
 * and Settings → System health. Two surfaces each deciding for
 * themselves what counts as broken is how they drift into disagreeing
 * about whether the install is fine.
 *
 * Checks that touch the network (the WordPress ping, the Search Console
 * property list) are NOT run on a page render. They run on a schedule,
 * the result is stored, and surfaces read the stored result with its
 * timestamp, so a dashboard visit stays fast and the banner can say how
 * old its evidence is rather than implying it is live.
 *
 * WORDING
 *
 * This fork is bilingual, so an issue carries no sentence: it carries a
 * `kind`, the numbers and names the sentence is built from, and — when
 * the outside world said something — that answer verbatim in `detail`.
 * The sentences live in messages/*.json under `installHealth.issues`.
 * A stored result therefore reads in whichever language the person
 * viewing it uses, not the language the scheduler happened to run in.
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
import { isClosedTask } from "./task-status";
import type { NetworkFailureKind } from "./network-error";

/**
 * How bad is it?
 *
 * - `broken`   something the user believes is connected is not. Always
 *              the result of evidence, never of an absence we failed to
 *              check.
 * - `stalled`  it works, and nothing is coming out of it.
 * - `idle`     never set up. Not a fault — shown on the health page, and
 *              deliberately NOT on the dashboard, because a banner that is
 *              always on is a banner nobody reads.
 */
export type HealthSeverity = "broken" | "stalled" | "idle";

/** Each kind has a title, an evidence line and a fix label in the messages. */
export const HEALTH_ISSUE_KINDS = [
  "wp_no_creds",
  "wp_unreachable",
  "gsc_other_property",
  "gsc_account_empty",
  "gsc_not_in_account",
  "fix_queue_stale",
  "nothing_completed",
  "rank_none",
  "rank_partial",
  "never_audited",
  "audit_failed",
  "sweep_unreachable",
  "sweep_failing",
  "check_failed",
] as const;

export type HealthIssueKind = (typeof HEALTH_ISSUE_KINDS)[number];

export type HealthIssue = {
  /** Stable id, so a surface can dismiss or order without matching text. */
  id: string;
  severity: HealthSeverity;
  kind: HealthIssueKind;
  /**
   * The numbers and names the sentence is built from. Never prose: the
   * prose is in the message files, in both languages.
   */
  params: Record<string, string | number>;
  /**
   * What the outside world actually answered, verbatim. This is the field
   * that stops the banner being another vague warning: "rest_no_route"
   * tells someone who knows WordPress the plugin is not active, and a
   * paraphrase would lose exactly that.
   */
  detail?: string;
  /** Tool ids, for the sweep issues — translated by the surface. */
  tools?: string[];
  /** The leading network cause, for the sweep issues. */
  networkKind?: NetworkFailureKind | null;
  /** Where to go to fix it. */
  fixHref: string;
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
export const STALE_QUEUE_DAYS = 7;
/** Long enough to be a real pattern rather than a quiet fortnight. */
export const NO_COMPLETION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How recent a rank reading has to be to count as current.
 *
 * Two weekly rotations: long enough that a keyword mid-rotation is not
 * reported as missing, short enough that a persistently unread one is.
 */
export const RANK_WINDOW_DAYS = 14;

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
    safe(checkSweepFailures),
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
        kind: "check_failed",
        params: { check: fn.name || "?" },
        detail: (err as Error).message,
        fixHref: "/settings/health",
      },
    ];
  }
}

/**
 * The one that matters most. A client with `wpEndpoint` set believes
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
        kind: "wp_no_creds",
        params: { client: c.name },
        fixHref: `/clients/${c.id}?tab=settings`,
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
        kind: "wp_unreachable",
        params: { client: c.name, endpoint: creds.endpoint },
        // The raw error, deliberately. See `detail`.
        detail: (ping.error ?? "").replace(/\s+/g, " ").slice(0, 300) || undefined,
        fixHref: `/clients/${c.id}?tab=settings`,
        clientId: c.id,
        clientName: c.name,
      });
    }
  }
  return out;
}

export type GscClientRow = { id: number; name: string; gscProperty: string | null };
export type GscAvailableProperty = { siteUrl: string };

function hostOf(property: string): string {
  const withoutPrefix = property.startsWith("sc-domain:")
    ? property.slice("sc-domain:".length)
    : property;
  let host = withoutPrefix;
  try {
    host = new URL(withoutPrefix).hostname;
  } catch {
    host = withoutPrefix.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
  return host.replace(/^www\./, "").toLowerCase();
}

/**
 * Which clients ask Google for a property the connected account cannot
 * read — the silent 403 behind every Search Console feature.
 *
 * Pure, so it can be tested without Google. A client with no property
 * set is not a fault and is not reported. When the account holds the
 * same site under another spelling (`sc-domain:` versus an URL prefix),
 * that spelling is offered, because it is almost always the fix.
 */
export function diagnoseGscProperties(
  rows: readonly GscClientRow[],
  available: readonly GscAvailableProperty[],
): HealthIssue[] {
  const held = new Set(available.map((p) => p.siteUrl));
  const out: HealthIssue[] = [];
  for (const c of rows) {
    const stored = c.gscProperty?.trim();
    if (!stored || held.has(stored)) continue;
    const wanted = hostOf(stored);
    const suggestion =
      available.find((p) => hostOf(p.siteUrl) === wanted)?.siteUrl ?? null;
    const kind: HealthIssueKind = suggestion
      ? "gsc_other_property"
      : available.length === 0
        ? "gsc_account_empty"
        : "gsc_not_in_account";
    out.push({
      id: `gsc_${kind}_${c.id}`,
      severity: "broken",
      kind,
      params: { client: c.name, stored, suggestion: suggestion ?? "" },
      fixHref: `/clients/${c.id}?tab=settings`,
      clientId: c.id,
      clientName: c.name,
    });
  }
  return out;
}

async function checkSearchConsole(): Promise<HealthIssue[]> {
  const { listGscProperties } = await import("./google-oauth");
  const available = await listGscProperties().catch(() => null);
  // Null means we could not ask Google at all — not connected, or the
  // call failed. That is a different problem from "the account has no
  // properties", and claiming the latter would be a guess.
  if (available === null) return [];

  const rows = await db
    .select({ id: clients.id, name: clients.name, gscProperty: clients.gscProperty })
    .from(clients);
  return diagnoseGscProperties(rows, available);
}

/**
 * Fixes the agent prepared and left waiting for a decision.
 *
 * Counted in days rather than shown as a bare number because "14
 * pending" reads as a healthy backlog and "the oldest has waited 68
 * days" does not.
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
  const days = Math.max(0, Math.floor((Date.now() - oldestMs) / DAY_MS));

  return [
    {
      id: "fix_queue_stale",
      severity: "stalled",
      kind: "fix_queue_stale",
      params: { count: n, days },
      fixHref: "/agent/autopilot",
    },
  ];
}

/**
 * The install-level symptom: work goes in, nothing comes out.
 *
 * Deliberately not "the agent applied nothing" — someone who works by
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
      kind: "nothing_completed",
      params: {
        open,
        days: NO_COMPLETION_DAYS,
        runs: Number(runs?.n ?? 0),
        applied: Number(applied?.n ?? 0),
      },
      fixHref: "/tasks",
    },
  ];
}

/**
 * Keywords tracked with no current position.
 *
 * Reads the positions table only. Which source the positions come from
 * is configured elsewhere (Settings → Google results), and this check
 * says nothing about which one to pick: it reports coverage.
 */
async function checkRankData(): Promise<HealthIssue[]> {
  const [kw] = await db.select({ n: count() }).from(keywords);
  const tracked = Number(kw?.n ?? 0);
  if (tracked === 0) return [];

  const since = new Date(Date.now() - RANK_WINDOW_DAYS * DAY_MS);

  // COVERAGE, not existence.
  //
  // Upstream's first version counted rows and returned early if ANY row
  // existed in the window — so with 16 of 24 keywords current and 8
  // never read, it said nothing, because one successful reading
  // suppressed it. A single keyword succeeding would have hidden
  // twenty-three failing ones. Counting distinct keywords is the measure
  // a user cares about: how much of my list actually has current data.
  const covered = await db
    .selectDistinct({ keywordId: keywordRankings.keywordId })
    .from(keywordRankings)
    .where(gte(keywordRankings.checkedAt, since));
  const current = covered.length;

  const everChecked = await db
    .selectDistinct({ keywordId: keywordRankings.keywordId })
    .from(keywordRankings);
  const neverChecked = Math.max(0, tracked - everChecked.length);

  const pct = Math.round((current / tracked) * 100);
  // 80% allows for a keyword or two legitimately mid-rotation. Below
  // that, the rank graphs are mostly empty and nothing else says so.
  if (pct >= 80 && neverChecked === 0) return [];

  return [
    current === 0
      ? {
          id: "rank_coverage_low",
          severity: "stalled",
          kind: "rank_none",
          params: { tracked, days: RANK_WINDOW_DAYS },
          fixHref: "/settings/serp",
        }
      : {
          id: "rank_coverage_low",
          severity: "stalled",
          kind: "rank_partial",
          params: {
            current,
            tracked,
            pct,
            never: neverChecked,
            days: RANK_WINDOW_DAYS,
          },
          fixHref: "/settings/serp",
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
  // Upstream's first version used one built with sql`` interpolation; it
  // compiled, ran, threw nothing, and returned 0 for every client, so it
  // reported audited clients as never audited. A health check that
  // invents problems trains people to ignore the banner.
  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const counted = await db
    .select({ clientId: audits.clientId, n: count() })
    .from(audits)
    .where(and(eq(audits.status, "completed"), eq(audits.kind, "crawler")))
    .groupBy(audits.clientId);

  const completedByClient = new Map(
    counted.map((r) => [r.clientId, Number(r.n)]),
  );

  return rows
    .filter((r) => (completedByClient.get(r.id) ?? 0) === 0)
    .map((r) => ({
      id: `never_audited_${r.id}`,
      severity: "idle" as const,
      kind: "never_audited" as const,
      params: { client: r.name },
      fixHref: `/clients/${r.id}`,
      clientId: r.id,
      clientName: r.name,
    }));
}

/**
 * The newest crawl for a client failed.
 *
 * The client page shows the last *completed* audit, so a crawl that
 * keeps failing looks exactly like a site that has stopped changing.
 * The data silently ages while the screen looks healthy.
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
      .where(and(eq(audits.clientId, c.id), eq(audits.kind, "crawler")))
      .orderBy(desc(audits.createdAt))
      .limit(1);
    if (!latest || latest.status !== "failed") continue;

    out.push({
      id: `audit_failed_${c.id}`,
      severity: "broken",
      kind: "audit_failed",
      params: {
        client: c.name,
        // ISO date; the surface formats it in the viewer's language.
        date:
          latest.createdAt instanceof Date
            ? latest.createdAt.toISOString()
            : "",
      },
      detail: latest.summary ? String(latest.summary).slice(0, 160) : undefined,
      fixHref: `/clients/${c.id}`,
      clientId: c.id,
      clientName: c.name,
    });
  }
  return out;
}

/**
 * Unattended checks that failed, grouped by the client they failed on.
 *
 * The scheduler says "27 of 38 checks ran — 11 could not", and that
 * count cannot be acted on. Upstream ran the real sweep and found those
 * 11 were two causes: nine on one client whose site no longer resolved,
 * two on a Search Console 403. So this groups by client and leads with
 * the count. One unreachable site is one thing to fix; nine tool
 * failures read as nine problems with the tools.
 */
async function checkSweepFailures(): Promise<HealthIssue[]> {
  const { readSweepFailures } = await import("./sweep-failures");
  const record = await readSweepFailures();
  // No record means the sweep has not run since this started being kept.
  // Not an all-clear, and not a fault either.
  if (!record || record.failures.length === 0) return [];

  const byClient = new Map<number, { name: string; tools: string[]; errors: string[] }>();
  for (const f of record.failures) {
    const entry = byClient.get(f.clientId) ?? {
      name: f.clientName,
      tools: [],
      errors: [],
    };
    entry.tools.push(f.toolId);
    if (f.error) entry.errors.push(f.error);
    byClient.set(f.clientId, entry);
  }

  const { classifyNetworkError, leadingFailureKind } = await import(
    "./network-error"
  );

  const out: HealthIssue[] = [];
  for (const [clientId, g] of byClient) {
    // One or two failures on a client is noise — a transient timeout, a
    // single API hiccup. Three or more of a client's checks failing
    // together, all network-shaped, is the site.
    const kinds = g.errors
      .map((e) => classifyNetworkError(e))
      .filter((k): k is NonNullable<typeof k> => k !== null);
    const looksUnreachable = g.tools.length >= 3 && kinds.length >= 3;

    // The most specific kind among them, not the commonest: most tools
    // strip the cause out of their own error messages, so "I do not know
    // why" is usually the majority view even when one check kept the
    // answer. See leadingFailureKind.
    const leading = leadingFailureKind(g.errors);

    out.push({
      id: `sweep_failing_${clientId}`,
      severity: "stalled",
      kind: looksUnreachable ? "sweep_unreachable" : "sweep_failing",
      params: { client: g.name, count: g.tools.length },
      tools: [...new Set(g.tools)],
      networkKind: looksUnreachable ? leading : null,
      detail: g.errors[0]?.slice(0, 120),
      fixHref: looksUnreachable ? `/clients/${clientId}?tab=settings` : `/clients/${clientId}`,
      clientId,
      clientName: g.name,
    });
  }

  // Worst first, which here means most checks affected.
  return out.sort(
    (a, b) => Number(b.params.count) - Number(a.params.count),
  );
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
  // An entry whose kind this build does not know (written by another
  // version) is dropped rather than rendered as a blank row.
  const known = new Set<string>(HEALTH_ISSUE_KINDS);
  return {
    issues: sortIssues(raw.issues.filter((i) => i && known.has(i.kind))),
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
 * The counts behind the banner headline.
 *
 * Null when there is nothing actionable — and also when nothing has been
 * checked, which the caller must keep apart through `neverChecked`.
 * `idle` is never counted: a client not yet audited is not a fault, and
 * counting it would make the banner permanent.
 */
export function summariseHealth(
  health: InstallHealth,
): { broken: number; stalled: number } | null {
  if (health.neverChecked) return null;
  const broken = health.issues.filter((i) => i.severity === "broken").length;
  const stalled = health.issues.filter((i) => i.severity === "stalled").length;
  if (broken === 0 && stalled === 0) return null;
  return { broken, stalled };
}
