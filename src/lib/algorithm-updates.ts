/**
 * Google's ranking updates, for lining a traffic change up against them.
 *
 * The list is Google's, not ours. google-ranking-updates.json is built
 * from the Search Status Dashboard by scripts/sync-google-updates.ts, and
 * google-updates-store.ts adds whatever the daily refresh has seen since.
 * Every entry links to Google's incident page and carries Google's own
 * announcement — not a note on which kinds of site won or lost, because
 * Google does not publish that, and a client report should not present
 * a guess about it as a fact.
 *
 * This replaced two hand-kept lists (here and on the /algorithm-updates
 * page) that disagreed with each other and with Google: see
 * google-status.ts for what was wrong.
 */

import shipped from "./google-ranking-updates.json";
import type { RankingUpdate } from "./google-status";

export type AlgoUpdate = RankingUpdate;

/**
 * The history as of the last sync script run. Most callers want
 * getRankingUpdates() from google-updates-store.ts, which adds the daily
 * refresh on top.
 */
export const ALGO_UPDATES: readonly AlgoUpdate[] = shipped.updates as AlgoUpdate[];

/** When the shipped history was read from Google. */
export const SHIPPED_UPDATES_FETCHED_AT: string = shipped.fetchedAt;

/**
 * Updates whose rollout overlaps a date range, widened by a margin on
 * each side. An update with no end date is still rolling out, so it
 * counts as running until now.
 */
export function updatesNear(
  updates: readonly AlgoUpdate[],
  startISO: string,
  endISO: string,
  marginDays = 3,
): AlgoUpdate[] {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const margin = marginDays * 86_400_000;
  return updates.filter((u) => {
    const us = new Date(u.date).getTime();
    const ue = u.endDate ? new Date(u.endDate).getTime() : Date.now();
    return us - margin <= end && ue + margin >= start;
  });
}

/**
 * One entry per incident, newest first. A later list wins, so a refresh
 * that has seen an update finish replaces the shipped "still rolling out".
 */
export function mergeUpdates(
  ...lists: readonly (readonly AlgoUpdate[])[]
): AlgoUpdate[] {
  const byId = new Map<string, AlgoUpdate>();
  for (const list of lists) for (const u of list) byId.set(u.id, u);
  return [...byId.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name),
  );
}
