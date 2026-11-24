/**
 * Decides where a ranking number comes from, and records which.
 *
 * The chain, best first:
 *
 *   1. Search Console — Google's own figure for a site the client owns,
 *      free, one call for the whole keyword set, cannot be captcha'd.
 *   2. SearXNG — a metasearch instance the user hosts (docker-compose
 *      profile `searxng`). Free, no key, no browser.
 *   3. Brave Search — official API, free tier behind a key. Its own
 *      index, not Google's.
 *   4. The paid results API (Serper / DataForSEO), if one is set up —
 *      an option, never required.
 *   5. Google in a headless browser — blocked from a server on the first
 *      request more often than not.
 *   6. DuckDuckGo's HTML page — answers, but only its first ~10 results,
 *      and it is not Google.
 *
 * A source that FAILS falls through to the next. A source that answers
 * "you are not in these results" does NOT: that is an answer, and asking
 * the next engine would quietly return whichever one flattered the
 * client most.
 *
 * What this deliberately does NOT do is hide which source answered.
 * They measure different things, so every result carries its source,
 * the engine(s) behind it and how many results were read, and the UI
 * shows all three — "absent from the first 10 results (DuckDuckGo)" is
 * a very different claim from "not in Google's top 100".
 */

import { checkRank, type RankCheckResult } from "./rank-checker";
import { configuredKeylessProviders } from "./serp";
import { failureFromError, isGoogleBlock, type RankFailure } from "./serp/failure";
import type { RankSource } from "./serp/sources";
import {
  fetchGscRankForQuery,
  fetchGscRankSnapshot,
  rankKey,
  type GscRankLookup,
} from "./rank-gsc";

export type { RankSource } from "./serp/sources";

/** Why Search Console did not give the number, when it did not. */
export type GscNote = "notConnected" | "noImpressions" | "error" | "forced";

export type ResolvedRank = {
  query: string;
  position: number | null;
  url: string | null;
  device: "desktop" | "mobile";
  /** Null when no source answered (then `failures` says why). */
  source: RankSource | null;
  /**
   * The engine(s) actually behind the number, as stored in
   * keyword_rankings.engine: "google", "duckduckgo", "brave", or for
   * SearXNG the engines that answered ("brave, duckduckgo, google").
   */
  engine: string | null;
  checkedAt: Date;
  /** GSC only: the day the figure describes, which is not today. */
  dataDate: string | null;
  /** GSC only: how many impressions the average rests on. */
  impressions: number | null;
  /** Browser only. */
  screenshotBuffer?: Buffer;
  resultsScanned: number;
  /**
   * Every source that was tried and gave no answer, in order. Empty when
   * the first source tried answered. When `source` is null, this is the
   * whole story of a failed check.
   */
  failures: RankFailure[];
  /** True when Google refused this server during this check. */
  googleBlocked: boolean;
  gscNote?: GscNote;
};

/**
 * Is this client set up such that GSC can answer rank questions?
 *
 * A separate, cheap check: the keywords UI wants to suggest connecting
 * Search Console without attempting a fetch.
 */
export function gscRankAvailability(client: {
  gscProperty: string | null | undefined;
}): { available: boolean } {
  return { available: Boolean(client.gscProperty) };
}

export type ResolveRankOptions = {
  query: string;
  domain: string;
  device: "desktop" | "mobile";
  gscProperty?: string | null;
  clientIdScope?: number;
  country?: string;
  language?: string;
  city?: string;
  screenshot?: boolean;
  /** Pre-fetched GSC data for the whole property. */
  snapshot?: GscRankLookup | null;
  /**
   * Skip GSC even when available, for callers that genuinely need a live
   * results page ("what does the page look like right now").
   */
  forceScrape?: boolean;
  /** A batch already got blocked by Google: go past it. */
  skipGoogle?: boolean;
};

/**
 * Resolve one keyword.
 *
 * `snapshot` lets a batch caller pass the single GSC response it already
 * fetched, so tracking fifty keywords costs one API call rather than
 * fifty. Without it this falls back to a per-query fetch.
 */
export async function resolveRank(opts: ResolveRankOptions): Promise<ResolvedRank> {
  const now = new Date();
  const failures: RankFailure[] = [];

  if (opts.forceScrape) return liveChain(opts, now, failures, "forced");
  if (!gscRankAvailability({ gscProperty: opts.gscProperty }).available || !opts.gscProperty) {
    return liveChain(opts, now, failures, "notConnected");
  }

  try {
    const row = opts.snapshot
      ? (opts.snapshot.rows.get(rankKey(opts.query, opts.device)) ?? null)
      : await fetchGscRankForQuery({
          siteUrl: opts.gscProperty,
          query: opts.query,
          device: opts.device,
          clientIdScope: opts.clientIdScope,
        });

    if (row) {
      return {
        query: opts.query,
        // GSC positions are averages like 7.4; rounded, as every rank
        // tracker shows them. The badge says it is an average.
        position: Math.round(row.position),
        url: null,
        device: opts.device,
        source: "gsc",
        engine: "google",
        checkedAt: now,
        dataDate: row.dataDate,
        impressions: row.impressions,
        resultsScanned: 0,
        failures,
        googleBlocked: false,
      };
    }
    // The property answered, but this query is not in it: zero
    // impressions in the window. Useful, and NOT the same as "we failed
    // to check" — so look at a live page to see whether it ranks
    // somewhere nobody clicks.
    return liveChain(opts, now, failures, "noImpressions");
  } catch (err) {
    // Token expired, property removed, quota — degrade to the live
    // sources rather than leaving the user with nothing.
    failures.push(gscFailure(err));
    return liveChain(opts, now, failures, "error");
  }
}

function gscFailure(err: unknown): RankFailure {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|403|invalid_grant|unauthor/i.test(msg)) {
    return { engine: "gsc", code: "badKey", detail: msg };
  }
  if (/429|quota|rate/i.test(msg)) return { engine: "gsc", code: "rateLimited", detail: msg };
  return { ...failureFromError("gsc", err), detail: msg };
}

/** Steps 2 to 6 of the chain. */
async function liveChain(
  opts: ResolveRankOptions,
  now: Date,
  failures: RankFailure[],
  gscNote: GscNote,
): Promise<ResolvedRank> {
  for (const provider of await configuredKeylessProviders()) {
    let hit: Awaited<ReturnType<typeof provider.lookup>>;
    try {
      hit = await provider.lookup({
        query: opts.query,
        domain: opts.domain,
        country: opts.country,
        language: opts.language,
      });
    } catch (err) {
      // A provider throwing must not end the chain.
      failures.push(failureFromError(provider.id, err));
      continue;
    }

    if (hit.ok) {
      return {
        query: opts.query,
        position: hit.position,
        url: hit.url,
        device: opts.device,
        source: provider.id,
        engine: hit.engine,
        checkedAt: now,
        dataDate: null,
        impressions: null,
        resultsScanned: hit.resultsScanned,
        failures,
        googleBlocked: false,
        gscNote,
      };
    }
    failures.push(hit.failure);
  }

  const r: RankCheckResult = await checkRank(opts.query, opts.domain, {
    screenshot: opts.screenshot,
    device: opts.device,
    country: opts.country,
    language: opts.language,
    city: opts.city,
    skipGoogle: opts.skipGoogle,
  });
  return fromCheckRank(r, opts, now, failures, gscNote);
}

/**
 * Map the browser/DuckDuckGo/API result onto a resolved rank. Exported
 * for tests: the source has to follow the engine that answered, which is
 * the bug this replaced (DuckDuckGo readings stored as "scrape" and shown
 * as Google).
 */
export function fromCheckRank(
  r: RankCheckResult,
  opts: Pick<ResolveRankOptions, "query" | "device">,
  now: Date,
  earlier: RankFailure[],
  gscNote?: GscNote,
): ResolvedRank {
  const failures = [...earlier, ...(r.failures ?? [])];
  const googleBlocked = failures.some(isGoogleBlock);
  const answered = !r.error || r.position !== null;
  const source: RankSource | null = !answered
    ? null
    : r.provider
      ? "api"
      : r.engine === "duckduckgo"
        ? "duckduckgo"
        : "scrape";

  return {
    query: opts.query,
    position: answered ? r.position : null,
    url: answered ? r.url : null,
    device: r.device ?? opts.device,
    source,
    engine: answered ? r.engine : null,
    checkedAt: r.checkedAt ?? now,
    dataDate: null,
    impressions: null,
    screenshotBuffer: r.screenshotBuffer,
    resultsScanned: answered ? r.resultsScanned : 0,
    failures: answered && failures.length === 0 ? [] : failures,
    googleBlocked,
    gscNote,
  };
}

/**
 * Fetch the GSC snapshot once for a batch of keywords, or null if this
 * client can't use it. Returns null rather than throwing: a batch must
 * not die because Search Console had a bad minute.
 */
export async function prefetchGscSnapshot(opts: {
  gscProperty?: string | null;
  clientIdScope?: number;
  country?: string;
}): Promise<GscRankLookup | null> {
  if (!opts.gscProperty) return null;
  try {
    return await fetchGscRankSnapshot({
      siteUrl: opts.gscProperty,
      clientIdScope: opts.clientIdScope,
      country: opts.country,
    });
  } catch {
    return null;
  }
}
