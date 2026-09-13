/**
 * Google's ranking updates, kept current.
 *
 * The shipped history plus the dashboard's incidents.json as last
 * fetched. Reading never touches the network — a page render or a report
 * must not wait on Google — and the scheduler refreshes once a day.
 */

import { ALGO_UPDATES, mergeUpdates, type AlgoUpdate } from "./algorithm-updates";
import { STATUS_ORIGIN, updatesFromIncidentsJson } from "./google-status";
import { getSetting, setSetting } from "./settings-store";

type Stored = { fetchedAt: string; updates: AlgoUpdate[] };

const KEY = "google.ranking_updates" as const;

export async function getRankingUpdates(): Promise<AlgoUpdate[]> {
  const stored = await getSetting<Stored>(KEY).catch(() => null);
  return mergeUpdates(ALGO_UPDATES, stored?.updates ?? []);
}

/** When the daily refresh last succeeded, or null if it never has. */
export async function rankingUpdatesRefreshedAt(): Promise<string | null> {
  const stored = await getSetting<Stored>(KEY).catch(() => null);
  return stored?.fetchedAt ?? null;
}

export async function refreshRankingUpdates(): Promise<{
  fetched: number;
  added: number;
}> {
  const res = await fetch(`${STATUS_ORIGIN}/incidents.json`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`The Search Status Dashboard returned HTTP ${res.status}.`);
  }
  const updates = updatesFromIncidentsJson(await res.json());
  const known = new Set(ALGO_UPDATES.map((u) => u.id));
  await setSetting(KEY, { fetchedAt: new Date().toISOString(), updates });
  return {
    fetched: updates.length,
    added: updates.filter((u) => !known.has(u.id)).length,
  };
}
