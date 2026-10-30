/**
 * Every place a ranking number can come from, and what each one IS.
 *
 * One table, because the alternative is what was here before: the list
 * of sources in `RankSource`, a two-way ternary in `rankProvenance`
 * inside lib/mcp/tools.ts, and the Drizzle enum on
 * `keyword_rankings.source` — three hardcoded lists of the same thing,
 * which is exactly the pair-that-drifts this codebase keeps finding.
 * Adding a source now means adding a row here.
 *
 * `provenance` is not decoration. These sources measure different
 * things, so subtracting one from another invents movement:
 * `comparePositions` refuses to, and this text is what the UI and the
 * MCP server show to explain why two numbers are not the same kind of
 * number.
 */

export const RANK_SOURCES = {
  gsc: {
    label: "Search Console",
    provenance:
      "Google Search Console — impression-weighted average position for the day, across real searchers",
    /** Only answers for a property the user has verified. */
    ownSiteOnly: true,
  },
  searxng: {
    label: "SearXNG",
    provenance:
      "SearXNG metasearch — the merged ranking from whichever engines your instance queried, at one moment",
    ownSiteOnly: false,
  },
  brave: {
    label: "Brave Search",
    provenance:
      "Brave Search's own independent index — not Google's, so a page can sit far higher or lower here",
    ownSiteOnly: false,
  },
  scrape: {
    label: "Live SERP check",
    provenance:
      "browser scrape — the position this server was shown at one moment, from one location",
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

export function rankSourceLabel(source: string): string {
  return isRankSource(source) ? RANK_SOURCES[source].label : source;
}
