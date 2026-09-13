/**
 * Search Console answers, shaped for the questions an SEO asks of them.
 *
 * Pure — no fetching. The MCP tools fetch and hand rows here. Modelled on
 * the tools in mcp-gsc (MIT): a period comparison and a batch indexing
 * check over a site's top pages. Two things are done deliberately,
 * because the obvious version of each gives a confident wrong answer:
 *
 *  - Windows end on the last day Search Console has finished processing,
 *    not yesterday. A "last 7 days" that includes unfinished days reads
 *    as a traffic drop that is only Google still counting.
 *  - Totals come from date rows, not from summing query rows. Query rows
 *    leave out anonymised queries, so their sum is lower than the site's
 *    real clicks and makes any comparison against the property look off.
 */

export type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type DayWindow = { start: string; end: string; days: number };

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Two back-to-back windows of equal length, the later one ending on the
 * newest date a `dataState: "final"` date query returned. Null when that
 * query returned nothing.
 *
 * A day with no impressions has no row, so the newest row can be older
 * than Google's newest finished day. The windows then end a little
 * earlier; both are still complete, which is the property that matters.
 */
export function comparableWindows(
  finalDates: readonly string[],
  days: number,
): { current: DayWindow; previous: DayWindow } | null {
  if (finalDates.length === 0) return null;
  const last = [...finalDates].sort().at(-1)!;
  return {
    current: { start: shiftDate(last, -(days - 1)), end: last, days },
    previous: { start: shiftDate(last, -(2 * days - 1)), end: shiftDate(last, -days), days },
  };
}

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * Clicks, impressions and position for a window, from rows with the
 * date dimension. Average position is weighted by impressions, which is
 * how Search Console's own average combines across days.
 */
export function windowTotals(dateRows: readonly GscRow[], window: DayWindow) {
  const rows = dateRows.filter((r) => r.keys[0] >= window.start && r.keys[0] <= window.end);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const weighted = rows.reduce((s, r) => s + r.position * r.impressions, 0);
  return {
    ...window,
    clicks,
    impressions,
    ctr: impressions > 0 ? round(clicks / impressions, 4) : null,
    averagePosition: impressions > 0 ? round(weighted / impressions, 1) : null,
    daysWithData: rows.length,
  };
}

export type RowChange = {
  key: string;
  clicks: number;
  previousClicks: number;
  clickChange: number;
  impressions: number;
  previousImpressions: number;
  position: number | null;
  previousPosition: number | null;
};

/** The biggest gains and losses in clicks between two sets of rows. */
export function comparePeriods(
  current: readonly GscRow[],
  previous: readonly GscRow[],
  limit = 10,
): { gainers: RowChange[]; losers: RowChange[] } {
  const byKey = (rows: readonly GscRow[]) => new Map(rows.map((r) => [r.keys[0], r]));
  const cur = byKey(current);
  const prev = byKey(previous);
  const changes: RowChange[] = [...new Set([...cur.keys(), ...prev.keys()])].map((key) => {
    const c = cur.get(key);
    const p = prev.get(key);
    return {
      key,
      clicks: c?.clicks ?? 0,
      previousClicks: p?.clicks ?? 0,
      clickChange: (c?.clicks ?? 0) - (p?.clicks ?? 0),
      impressions: c?.impressions ?? 0,
      previousImpressions: p?.impressions ?? 0,
      position: c ? round(c.position, 1) : null,
      previousPosition: p ? round(p.position, 1) : null,
    };
  });
  return {
    gainers: changes
      .filter((x) => x.clickChange > 0)
      .sort((a, b) => b.clickChange - a.clickChange)
      .slice(0, limit),
    losers: changes
      .filter((x) => x.clickChange < 0)
      .sort((a, b) => a.clickChange - b.clickChange)
      .slice(0, limit),
  };
}

/**
 * Pages with the most impressions. Search Console returns rows ordered
 * by clicks, so a page seen often and clicked rarely — the kind most
 * worth checking — would otherwise fall off the end.
 */
export function topPagesByImpressions(rows: readonly GscRow[], n: number): string[] {
  return [...rows]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, n)
    .map((r) => r.keys[0]);
}

export type InspectionFacts = {
  url: string;
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  error?: string;
};

export type IndexingAudit = {
  inspected: number;
  indexed: string[];
  notIndexed: { url: string; coverageState: string | null }[];
  blockedByRobotsTxt: string[];
  noindex: { url: string; indexingState: string }[];
  fetchProblems: { url: string; pageFetchState: string }[];
  /** Google picked a different canonical from the one the page declares. */
  canonicalMismatch: { url: string; declared: string; googleChose: string }[];
  couldNotInspect: { url: string; error: string }[];
};

/**
 * Sort inspection results into what to act on. A page can appear in more
 * than one list — not indexed *because* robots.txt blocks it, say — since
 * the cause is the useful part.
 */
export function summariseInspections(results: readonly InspectionFacts[]): IndexingAudit {
  const out: IndexingAudit = {
    inspected: results.length,
    indexed: [],
    notIndexed: [],
    blockedByRobotsTxt: [],
    noindex: [],
    fetchProblems: [],
    canonicalMismatch: [],
    couldNotInspect: [],
  };
  for (const r of results) {
    if (r.error) {
      out.couldNotInspect.push({ url: r.url, error: r.error });
      continue;
    }
    // Google's verdict field: PASS means the URL is in the index.
    if (r.verdict === "PASS") out.indexed.push(r.url);
    else out.notIndexed.push({ url: r.url, coverageState: r.coverageState });
    if (r.robotsTxtState === "DISALLOWED") out.blockedByRobotsTxt.push(r.url);
    if (r.indexingState?.startsWith("BLOCKED_BY")) {
      out.noindex.push({ url: r.url, indexingState: r.indexingState });
    }
    if (
      r.pageFetchState &&
      r.pageFetchState !== "SUCCESSFUL" &&
      r.pageFetchState !== "PAGE_FETCH_STATE_UNSPECIFIED"
    ) {
      out.fetchProblems.push({ url: r.url, pageFetchState: r.pageFetchState });
    }
    if (r.googleCanonical && r.userCanonical && r.googleCanonical !== r.userCanonical) {
      out.canonicalMismatch.push({
        url: r.url,
        declared: r.userCanonical,
        googleChose: r.googleCanonical,
      });
    }
  }
  return out;
}
