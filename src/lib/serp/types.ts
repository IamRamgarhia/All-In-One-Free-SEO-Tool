/**
 * The contract every keyless rank source implements.
 *
 * These sit between Search Console and the browser. Search Console is
 * better than all of them for a site you own — Google's own figure,
 * free, and it cannot be rate-limited — so nothing here competes with
 * it. They exist for the cases it cannot answer: competitors' sites, and
 * clients who have not connected it.
 *
 * They come before the browser because the browser is the worst option
 * available: slow, memory-hungry, and blocked by Google from a server
 * on the very first request (measured on this project, Nov 2026).
 */

import type { RankFailure } from "./failure";

export type KeylessProviderId = "searxng" | "brave";

export type SerpLookup =
  | {
      ok: true;
      /** 1-indexed, or null when the domain is genuinely not in the results. */
      position: number | null;
      url: string | null;
      /** How many results we actually looked at, for provenance. */
      resultsScanned: number;
      /**
       * The engine(s) behind the answer, as stored in
       * keyword_rankings.engine. For SearXNG, the engines that answered
       * ("brave, duckduckgo, google"); for Brave, "brave".
       */
      engine: string;
    }
  | {
      ok: false;
      /** Never conflated with "not ranking". */
      failure: RankFailure;
    };

export type SerpQuery = {
  query: string;
  /** Bare domain, no scheme, no www. */
  domain: string;
  /** ISO-3166 alpha-2, uppercase. */
  country?: string;
  /** ISO-639-1. */
  language?: string;
};

export type KeylessProvider = {
  id: KeylessProviderId;
  label: string;
  lookup(q: SerpQuery): Promise<SerpLookup>;
};
