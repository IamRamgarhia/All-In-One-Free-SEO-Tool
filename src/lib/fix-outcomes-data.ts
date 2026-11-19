/**
 * Loads the data that fix-outcomes.ts reasons about.
 *
 * Kept separate so the judgement — when a change may be measured, when
 * a percentage is meaningless, how to word it without claiming cause —
 * stays pure and testable without mocking Search Console or the
 * database. That module has 23 tests and touches neither.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { agentActions, clients } from "@/db/schema";
import {
  outcomeFor,
  rollupOutcomes,
  windowsFor,
  type FixOutcome,
  type FixWindow,
  type OutcomeRollup,
  type PeriodMetrics,
} from "./fix-outcomes";

export type OutcomeReport = {
  outcomes: FixOutcome[];
  rollup: OutcomeRollup;
  /**
   * Why there is nothing to show, when there is nothing to show.
   *
   * Null when the report is real. A string here is the difference
   * between "your changes did nothing" and "we cannot see your Search
   * Console", and those must never render the same.
   */
  unavailable: string | null;
};

const EMPTY_ROLLUP = rollupOutcomes([]);

/**
 * Measure every confirmed change for a client.
 *
 * Returns `unavailable` rather than an empty report when Search Console
 * cannot be read — which on this install is every client, since the
 * connected Google account holds no properties.
 */
export async function measureFixOutcomes(
  clientId: number,
  now: Date = new Date(),
): Promise<OutcomeReport> {
  const [client] = await db
    .select({ gscProperty: clients.gscProperty })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const actions = await db
    .select({
      id: agentActions.id,
      kind: agentActions.kind,
      targetUrl: agentActions.targetUrl,
      appliedAt: agentActions.appliedAt,
    })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.clientId, clientId),
        inArray(agentActions.status, ["applied", "verified"]),
        isNotNull(agentActions.appliedAt),
        isNotNull(agentActions.targetUrl),
      ),
    );

  const fixes: FixWindow[] = actions
    .filter((a) => a.appliedAt && a.targetUrl)
    .map((a) => ({
      actionId: a.id,
      url: a.targetUrl!,
      kind: a.kind,
      appliedAt: a.appliedAt!,
    }));

  if (fixes.length === 0) {
    return { outcomes: [], rollup: EMPTY_ROLLUP, unavailable: null };
  }

  if (!client?.gscProperty) {
    return {
      outcomes: [],
      rollup: EMPTY_ROLLUP,
      unavailable:
        `${fixes.length} change${fixes.length === 1 ? " has" : "s have"} been ` +
        `applied, but there is no Search Console property connected for this ` +
        `client, so their effect cannot be measured. Connect one and the ` +
        `before/after comparison appears here.`,
    };
  }

  // Group by the DAY a change was applied: every fix made on the same
  // day shares the same before/after windows, so one pair of API calls
  // serves all of them. Per-fix fetching would be two calls each — 80
  // calls for a month of work on a busy site, against a quota.
  const byDay = new Map<string, FixWindow[]>();
  for (const f of fixes) {
    const key = f.appliedAt.toISOString().slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(f);
    byDay.set(key, list);
  }

  const outcomes: FixOutcome[] = [];
  let apiFailed = false;

  for (const [, group] of byDay) {
    const windows = windowsFor(group[0].appliedAt, now);
    if (!windows) {
      // Too early. No API call — the answer does not depend on data we
      // would be charged a quota to fetch.
      for (const f of group) outcomes.push(outcomeFor(f, null, null, now));
      continue;
    }

    const [before, after] = await Promise.all([
      pagesInWindow(client.gscProperty, windows.before),
      pagesInWindow(client.gscProperty, windows.after),
    ]);

    if (before === null || after === null) {
      apiFailed = true;
      continue;
    }

    for (const f of group) {
      outcomes.push(
        outcomeFor(f, before.get(norm(f.url)) ?? null, after.get(norm(f.url)) ?? null, now),
      );
    }
  }

  if (outcomes.length === 0 && apiFailed) {
    return {
      outcomes: [],
      rollup: EMPTY_ROLLUP,
      unavailable:
        "Search Console would not answer for this client, so the effect of " +
        "these changes could not be measured. This is usually a property " +
        "the connected Google account cannot read.",
    };
  }

  // Worst-first within measured, so a decline is never below the fold.
  outcomes.sort((a, b) => {
    const rank = (o: FixOutcome) =>
      o.confidence === "measured" ? 0 : o.confidence === "thin" ? 1 : 2;
    const r = rank(a) - rank(b);
    return r !== 0 ? r : a.clicksDelta - b.clicksDelta;
  });

  return { outcomes, rollup: rollupOutcomes(outcomes), unavailable: null };
}

function norm(u: string): string {
  return u
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/**
 * Per-page metrics for one date range, or null when the API refused.
 *
 * Null and empty are different answers and the caller treats them
 * differently: empty means the site genuinely had no rows, null means we
 * could not ask. Collapsing them would report a 403 as "your traffic is
 * zero".
 */
async function pagesInWindow(
  siteUrl: string,
  window: { start: string; end: string },
): Promise<Map<string, PeriodMetrics> | null> {
  try {
    const { fetchGscPerformance } = await import("./google-oauth");
    const rows = await fetchGscPerformance({
      siteUrl,
      startDate: window.start,
      endDate: window.end,
      dimensions: ["page"],
      rowLimit: 1000,
    });
    const out = new Map<string, PeriodMetrics>();
    for (const r of rows) {
      const page = r.keys[0];
      if (!page) continue;
      out.set(norm(page), {
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
      });
    }
    return out;
  } catch {
    return null;
  }
}
