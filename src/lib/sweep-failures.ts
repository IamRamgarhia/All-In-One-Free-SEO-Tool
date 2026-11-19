/**
 * Reading the last sweep's failures, without importing the sweep.
 *
 * WHY SEPARATE: tool-sweep.ts reaches every check it runs, several of
 * which call a model. A surface that only wants to REPORT what failed
 * pulled all of that into its import graph, and the capability table
 * noticed immediately — /settings/health flipped from
 * `needsAI: false` to `needsAI: required, usesBrowser: true` the moment
 * install-health imported it.
 *
 * That flag is derived from reachability and was not wrong; the import
 * was. This module touches only the settings store.
 *
 * Third time this exact split has been needed in one day — after
 * trial-shared.ts and daily-report.ts — which is the useful part: a
 * module that RUNS work and a module that REPORTS on it want different
 * dependency graphs, and keeping them together quietly widens the
 * blast radius of every page that displays a status.
 */

import { getSetting } from "./settings-store";

export type SweepFailureRecord = {
  at: string;
  /** How many checks ran in total, so a count has a denominator. */
  total: number;
  failures: {
    clientId: number;
    clientName: string;
    toolId: string;
    error: string;
  }[];
};

/**
 * The last sweep's failures, or null when no sweep has run since this
 * record started being kept.
 *
 * Null is not "nothing failed" — the caller has to keep those apart, for
 * the same reason the install-health report does everywhere else.
 */
export async function readSweepFailures(): Promise<SweepFailureRecord | null> {
  const raw = await getSetting<SweepFailureRecord>(
    "tool_sweep.last_failures",
  ).catch(() => null);
  if (!raw || !Array.isArray(raw.failures)) return null;
  return raw;
}
