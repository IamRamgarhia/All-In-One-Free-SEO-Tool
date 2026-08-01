/**
 * Decides where a ranking number comes from, and records which.
 *
 * The order is GSC first, scrape second, and that order is the point of
 * this file. Scraping was the only source until now: a headless browser
 * per keyword, parsing Google's HTML, liable to captchas, rate limits
 * and silent selector drift. Search Console has the same numbers, from
 * Google, for free, in one call for the whole keyword set — wherever the
 * client has connected it.
 *
 * What this deliberately does NOT do is hide which source answered. The
 * two measure different things (see rank-gsc.ts), so a chart that mixed
 * them silently would show movement that never happened the day a
 * keyword crossed from one source to the other. Every result carries its
 * source, and the UI shows it.
 */

import { checkRank, type RankCheckResult } from "./rank-checker";
import {
  fetchGscRankForQuery,
  fetchGscRankSnapshot,
  rankKey,
  type GscRankLookup,
} from "./rank-gsc";

export type RankSource = "gsc" | "scrape";

export type ResolvedRank = {
  query: string;
  position: number | null;
  url: string | null;
  device: "desktop" | "mobile";
  source: RankSource;
  checkedAt: Date;
  /** GSC only: the day the figure describes, which is not today. */
  dataDate: string | null;
  /** GSC only: how many impressions the average rests on. */
  impressions: number | null;
  /** Scrape only. */
  screenshotBuffer?: Buffer;
  resultsScanned: number;
  error?: string;
  /**
   * Why GSC wasn't used, when it wasn't. Shown to the user, because
   * "connect Search Console and this gets better" is the single most
   * valuable thing we can tell someone looking at a scraped number.
   */
  gscSkipReason?: string;
};

/**
 * Is this client set up such that GSC can answer rank questions?
 *
 * Deliberately a separate, cheap check: the keywords UI wants to show
 * "connect GSC for real ranking data" without attempting a fetch.
 */
export function gscRankAvailability(client: {
  gscProperty: string | null | undefined;
}): { available: boolean; reason?: string } {
  if (!client.gscProperty) {
    return {
      available: false,
      reason:
        "Search Console isn't connected for this client. Connecting it replaces scraped rankings with Google's own numbers — free, more accurate, and it can't get rate-limited.",
    };
  }
  return { available: true };
}

/**
 * Resolve one keyword.
 *
 * `snapshot` lets a batch caller pass the single GSC response it already
 * fetched, so tracking fifty keywords costs one API call rather than
 * fifty. Without it this falls back to a per-query fetch.
 */
export async function resolveRank(opts: {
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
   * Skip GSC even when available. The rank-where tool and the local grid
   * genuinely need a live SERP — they are answering "what does the page
   * look like right now", not "where did we rank".
   */
  forceScrape?: boolean;
}): Promise<ResolvedRank> {
  const now = new Date();

  if (!opts.forceScrape) {
    const availability = gscRankAvailability({ gscProperty: opts.gscProperty });
    if (availability.available && opts.gscProperty) {
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
            // GSC positions are 1-indexed averages like 7.4. Rounding to
            // the nearest whole position is what every rank tracker
            // shows; the raw average is kept in `impressions`-adjacent
            // context via the confidence badge rather than displayed as
            // false precision.
            position: Math.round(row.position),
            url: null,
            device: opts.device,
            source: "gsc",
            checkedAt: now,
            dataDate: row.dataDate,
            impressions: row.impressions,
            resultsScanned: 0,
          };
        }

        // The property answered, but this query wasn't in it. That means
        // zero impressions — the site did not appear for this search at
        // all in the window. Genuinely useful information, and NOT the
        // same as "we failed to check", so fall through to a scrape to
        // find out whether it ranks somewhere nobody clicks.
      } catch (err) {
        // Token expired, property removed, quota — any of these should
        // degrade to scraping rather than leaving the user with nothing.
        return scrapeFallback(opts, now, gscErrorReason(err));
      }
      return scrapeFallback(
        opts,
        now,
        "No Search Console impressions for this query in the last 10 days, so there was no position to read. Checked the live SERP instead.",
      );
    }
    return scrapeFallback(opts, now, availability.reason);
  }

  return scrapeFallback(opts, now, undefined);
}

function gscErrorReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|403|invalid_grant|unauthor/i.test(msg)) {
    return "Search Console rejected our access — reconnect it in Settings → Google. Fell back to checking the live SERP.";
  }
  if (/429|quota|rate/i.test(msg)) {
    return "Search Console is rate-limiting us right now. Fell back to checking the live SERP.";
  }
  return "Couldn't reach Search Console, so this came from a live SERP check instead.";
}

async function scrapeFallback(
  opts: Parameters<typeof resolveRank>[0],
  now: Date,
  reason: string | undefined,
): Promise<ResolvedRank> {
  const r: RankCheckResult = await checkRank(opts.query, opts.domain, {
    screenshot: opts.screenshot,
    device: opts.device,
    country: opts.country,
    language: opts.language,
    city: opts.city,
  });

  return {
    query: opts.query,
    position: r.position,
    url: r.url,
    device: r.device,
    source: "scrape",
    checkedAt: r.checkedAt ?? now,
    dataDate: null,
    impressions: null,
    screenshotBuffer: r.screenshotBuffer,
    resultsScanned: r.resultsScanned,
    error: r.error,
    gscSkipReason: reason,
  };
}

/**
 * Fetch the GSC snapshot once for a batch of keywords, or null if this
 * client can't use it. Callers pass the result into `resolveRank` for
 * every keyword.
 *
 * Returns null rather than throwing: a batch rank run must not die
 * because Search Console had a bad minute. Each keyword then falls back
 * to scraping on its own.
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
