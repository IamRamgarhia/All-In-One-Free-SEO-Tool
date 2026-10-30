/**
 * Comparing two rank readings taken at different times.
 *
 * A tracked keyword's position comes from one of two measurements that
 * are not the same quantity. Search Console reports an *average*
 * position over a date range, weighted by impressions. A browser check
 * reports where the domain sat in one SERP at one moment, from one IP.
 * `resolveRank` prefers Search Console and falls back to scraping when
 * it is unavailable or the query drew no impressions — so a keyword with
 * intermittent impressions alternates between the two run to run.
 *
 * Subtracting one from the other produces movement nobody made, and the
 * result is indistinguishable from a real one.
 *
 * The rule was already written down twice — in the `source` column's own
 * comment in schema.ts ("mixing them on a chart without saying which is
 * which invents movement that never happened") and inline in
 * `getKeywords` in lib/mcp/tools.ts, which honours it. It was missing
 * from the two paths that *act* on movement:
 *
 *   - the ranking-drop notification in app/keywords/rank-actions.ts,
 *     which read the previous position without reading its source, so a
 *     GSC average of 7 followed by a scrape of 12 pushed "fell from #7
 *     to #12 — ▼5 positions". Its notification even carries a "Source"
 *     field, showing only the *current* source, which made a cross-source
 *     subtraction look like it had provenance.
 *   - the volatility score on /tools/serp-volatility, which averages
 *     |delta| across keywords and labels the result calm/choppy/stormy,
 *     so source switches reported the whole SERP as stormy.
 *
 * Hence one helper rather than a third copy of the rule.
 *
 * Not demonstrated against live data: this install has 24 tracked
 * keywords and zero rows in keyword_rankings, because Google and
 * DuckDuckGo block it and no keyword here has GSC impressions. The
 * reasoning is from the code and the schema, not from a reproduction.
 */

export type RankReading = {
  position: number | null;
  /** Matches keyword_rankings.source, which is NOT NULL default "scrape". */
  source: "scrape" | "gsc";
};

export const CROSS_SOURCE_NOTE =
  "Not comparable — these two readings came from different sources " +
  "(a Search Console average and a live SERP check measure different things).";

export type RankComparison = {
  /** Positions lost: positive means the ranking got worse. Null when incomparable. */
  drop: number | null;
  /** Positions won: positive means the ranking improved. Null when incomparable. */
  gain: number | null;
  comparable: boolean;
  /** Why not, when not. Safe to show a user. */
  note?: string;
};

const INCOMPARABLE: RankComparison = {
  drop: null,
  gain: null,
  comparable: false,
};

/**
 * Compare an earlier reading with a later one.
 *
 * Both `drop` and `gain` are returned, as negatives of each other, on
 * purpose: the three call sites had three different sign conventions,
 * and asking each to negate a single `delta` is how a sign bug gets
 * introduced while fixing a provenance one.
 *
 * A missing position is not comparable either — "not in the top 100"
 * and a number do not subtract.
 */
export function comparePositions(
  earlier: RankReading | null | undefined,
  later: RankReading | null | undefined,
): RankComparison {
  if (!earlier || !later) return INCOMPARABLE;
  if (earlier.position === null || later.position === null) {
    return INCOMPARABLE;
  }
  if (earlier.source !== later.source) {
    return { ...INCOMPARABLE, note: CROSS_SOURCE_NOTE };
  }
  const drop = later.position - earlier.position;
  return { drop, gain: -drop, comparable: true };
}
