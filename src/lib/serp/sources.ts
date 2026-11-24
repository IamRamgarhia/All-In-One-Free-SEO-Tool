/**
 * Every place a ranking number can come from, and what each one IS.
 *
 * One table, because the alternative is what was here before: the list
 * of sources in `RankSource`, a two-way ternary in `rankProvenance`
 * inside lib/mcp/tools.ts, and the Drizzle enum on
 * `keyword_rankings.source` — three hardcoded lists of the same thing.
 * Adding a source now means adding a row here (and its label in
 * messages/*.json under `rankSource`).
 *
 * The order is the order the chain tries them in (rank-resolve.ts):
 * Search Console, then the keyless sources, then the optional paid API,
 * then the browser on Google, then DuckDuckGo.
 *
 * `provenance` is not decoration. These sources measure different
 * things, so subtracting one from another invents movement:
 * `comparePositions` refuses to, and this text is what the MCP server
 * shows a model to explain why two numbers are not the same kind of
 * number. (The interface has its own wording, translated.)
 */

export const RANK_SOURCES = {
  gsc: {
    provenance:
      "Google Search Console — impression-weighted average position for the day, across real searchers",
    ownSiteOnly: true,
  },
  searxng: {
    provenance:
      "SearXNG metasearch — the merged ranking from whichever engines your instance queried, at one moment",
    ownSiteOnly: false,
  },
  brave: {
    provenance:
      "Brave Search's own independent index — not Google's, so a page can sit far higher or lower here",
    ownSiteOnly: false,
  },
  api: {
    provenance:
      "Google results from the paid results API configured in Settings, for the client's country, at one moment",
    ownSiteOnly: false,
  },
  scrape: {
    provenance:
      "browser check on Google — the position this server was shown at one moment, from one location",
    ownSiteOnly: false,
  },
  duckduckgo: {
    provenance:
      "DuckDuckGo's first page (about ten results) — not Google; a miss only means outside those results",
    ownSiteOnly: false,
  },
} as const;

export type RankSource = keyof typeof RANK_SOURCES;

/** For the Drizzle column and anywhere else that needs the bare list. */
export const RANK_SOURCE_IDS = Object.keys(RANK_SOURCES) as [
  RankSource,
  ...RankSource[],
];

export function isRankSource(value: unknown): value is RankSource {
  return typeof value === "string" && value in RANK_SOURCES;
}

/**
 * What a rank number actually is, in a sentence.
 *
 * Falls back rather than throwing: a row written by a future version,
 * or hand-edited, must not take down a page that is only trying to
 * label it. Saying "unrecognised" is honest; guessing "scrape" is not.
 */
export function rankProvenance(source: string): string {
  return isRankSource(source)
    ? RANK_SOURCES[source].provenance
    : `unrecognised source "${source}" — treat this number as unverified`;
}
