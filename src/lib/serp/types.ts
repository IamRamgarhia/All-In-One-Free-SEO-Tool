/**
 * The contract every keyless rank source implements.
 *
 * These sit between Search Console and the browser scraper. Search
 * Console is better than all of them for a site you own — it is
 * Google's own impression-weighted figure, free, official, and it
 * cannot be rate-limited — so nothing here competes with it. They exist
 * for the cases GSC cannot answer: competitors' sites, and clients who
 * have not connected it.
 *
 * They are tried before the browser because the browser is the worst
 * option available: slow, memory-hungry, and on this machine blocked
 * outright by Google and DuckDuckGo alike.
 */

export type SerpProviderId = "searxng" | "brave";

export type SerpLookup =
  | {
      ok: true;
      /** 1-indexed, or null when the domain is genuinely not in the results. */
      position: number | null;
      url: string | null;
      /** How many results we actually looked at, for provenance. */
      resultsScanned: number;
      /** Human-readable extra, e.g. which engines backed a SearXNG answer. */
      detail?: string;
    }
  | {
      ok: false;
      /**
       * Why we got no answer. Never conflated with "not ranking" — that
       * conflation is the bug this codebase keeps finding, most
       * recently in the local grid and the Google scanner.
       */
      error: string;
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

export type SerpProvider = {
  id: SerpProviderId;
  label: string;
  lookup(q: SerpQuery): Promise<SerpLookup>;
};
