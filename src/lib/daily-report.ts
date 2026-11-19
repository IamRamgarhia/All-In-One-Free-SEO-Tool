/**
 * Reading the last nightly sweep's result, without importing the sweep.
 *
 * WHY SEPARATE: daily-agent.ts reaches every job it runs — audits, the
 * AI suggestion pass, rank checks, the browser pool. A page that only
 * wants to *display* what happened pulled all of that into its import
 * graph, and the capability table noticed: /settings/health flipped from
 * `needsAI: false` to `needsAI: required, usesBrowser: true` the moment
 * it rendered the job list.
 *
 * That flag is derived from reachability and it was not wrong — the code
 * really was reachable. The fix is to not reach it. This module touches
 * only the settings store, so the page's graph stays honest without an
 * entry in KNOWN_FREE_PAGES, which is the list of exceptions and should
 * stay as short as the code allows.
 *
 * Same split, same reason, as trial-shared.ts.
 */

import { getSetting } from "./settings-store";

/**
 * What the last nightly sweep did, as stored.
 *
 * Kept rather than recomputed because the sweep runs once a day and
 * takes minutes; a page cannot re-run it to find out how it went.
 */
export type StoredDailyReport = {
  at: string;
  durationMs: number;
  steps: { name: string; ok: boolean; detail?: string; durationMs: number }[];
};

/** The stored report, or null when no sweep has finished yet. */
export async function readDailyReport(): Promise<StoredDailyReport | null> {
  const raw = await getSetting<StoredDailyReport>(
    "daily_agent.last_report",
  ).catch(() => null);
  if (!raw || !Array.isArray(raw.steps)) return null;
  return raw;
}

/**
 * "18 of 22 nightly jobs ok, 4 failed: rank.sweep, …"
 *
 * Names the failures rather than counting them. "4 failed" sends someone
 * looking; "4 failed: rank.sweep, metrics.snapshot" tells them what to
 * look at.
 */
export function summariseDailyReport(r: StoredDailyReport): string {
  const failed = r.steps.filter((s) => !s.ok);
  const ok = r.steps.length - failed.length;
  if (failed.length === 0) return `all ${r.steps.length} nightly jobs ok`;
  return (
    `${ok} of ${r.steps.length} nightly jobs ok, ${failed.length} failed: ` +
    failed.map((s) => s.name).join(", ")
  );
}
