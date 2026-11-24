/**
 * Running rank checks over a list of keywords: pacing, Google give-up,
 * and an honest count.
 *
 * Three faults this replaces, all measured on this project:
 *
 *  - No pause between keywords. Thirty live searches back to back from
 *    one IP is the surest way to get blocked, and once Google has shown
 *    a captcha, asking again seconds later only gets the next one.
 *  - Google was retried for every keyword after blocking the first. Each
 *    attempt costs a browser page load (seconds, hundreds of MB) for a
 *    captcha, before falling back anyway. After the first block, the
 *    rest of the batch now goes straight past Google.
 *  - The weekly sweep counted a failed check as "checked", because a
 *    failed check returns { ok: false } rather than throwing, and only a
 *    throw was counted.
 *
 * Pure apart from the injected `check` and `sleep`, so the rules are
 * tested without a browser or a network.
 */

import type { RankSource } from "./serp/sources";

export type RankBatchOutcome =
  | { ok: true; source: RankSource; googleBlocked: boolean }
  | { ok: false; googleBlocked: boolean };

export type RankBatchSummary = {
  total: number;
  /** Keywords that got a reading (position or a confirmed absence). */
  checked: number;
  /** Keywords with no reading this time. */
  failed: number;
  /** Readings per source, e.g. { gsc: 3, searxng: 8, duckduckgo: 1 }. */
  bySource: Partial<Record<RankSource, number>>;
  /** Google blocked a check and was skipped for the rest of the batch. */
  googleAbandoned: boolean;
};

/**
 * Pause between two live searches: a few seconds, with jitter so the
 * requests do not arrive on a metronome. A courtesy to the engines (and
 * to a self-hosted SearXNG, which forwards every query to several of
 * them), not a figure any engine publishes.
 */
export const RANK_BATCH_DELAY_MS = { base: 4_000, jitter: 3_000 } as const;

export function defaultRankDelay(): number {
  return RANK_BATCH_DELAY_MS.base + Math.floor(Math.random() * RANK_BATCH_DELAY_MS.jitter);
}

export async function runRankBatch<T>(
  items: readonly T[],
  check: (item: T, opts: { skipGoogle: boolean }) => Promise<RankBatchOutcome>,
  deps: {
    sleep?: (ms: number) => Promise<void>;
    delayMs?: () => number;
  } = {},
): Promise<RankBatchSummary> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const delayMs = deps.delayMs ?? defaultRankDelay;

  const summary: RankBatchSummary = {
    total: items.length,
    checked: 0,
    failed: 0,
    bySource: {},
    googleAbandoned: false,
  };

  // Search Console answers from one prefetched snapshot and costs no
  // request, so only a check that went to a live engine earns a pause
  // before the next one.
  let lastWasLive = false;

  for (const item of items) {
    if (lastWasLive) await sleep(delayMs());

    let outcome: RankBatchOutcome;
    try {
      outcome = await check(item, { skipGoogle: summary.googleAbandoned });
    } catch {
      // A thrown check is a failed check, never a silent success.
      outcome = { ok: false, googleBlocked: false };
    }

    if (outcome.googleBlocked) summary.googleAbandoned = true;
    if (outcome.ok) {
      summary.checked++;
      summary.bySource[outcome.source] = (summary.bySource[outcome.source] ?? 0) + 1;
      lastWasLive = outcome.source !== "gsc";
    } else {
      summary.failed++;
      lastWasLive = true;
    }
  }

  return summary;
}
