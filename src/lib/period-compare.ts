import { comparableWindows, type DayWindow } from "./gsc-insights";

/**
 * Split a run of daily rows into two equal halves and compare them.
 *
 * This replaces five copies of the same four lines:
 *
 *   const half = Math.floor(rows.length / 2);
 *   const recent = rows.slice(half).reduce(...);
 *   const prior  = rows.slice(0, half).reduce(...);
 *
 * which is wrong twice over.
 *
 * `slice(half)` is one element LONGER than `slice(0, half)` whenever the
 * row count is odd, so the recent half gets an extra day of traffic and
 * the comparison reports growth that is not there. It is not an
 * occasional edge case: getGa4OrganicTraffic asks for
 * `daysAgo(28) .. daysAgo(0)`, which is 29 days inclusive, so a complete
 * response is always odd and always inflates the recent half by 15/14,
 * about +7% on flat traffic. On a 7-row window it is 4 days against 3,
 * about +33%.
 *
 * Indexes are also the wrong thing to split on. GA4 omits days with no
 * data rather than returning a zero, so fourteen rows on one side can
 * span eighteen calendar days while fourteen on the other span eleven.
 * Equal row counts are not equal periods.
 *
 * So the split is by date, through the same `comparableWindows` the
 * Search Console paths already use: two back-to-back windows of equal
 * length, the later one ending on the newest day that has data. When
 * the span is odd the OLDEST day falls outside both windows, because
 * dropping the oldest day is the one choice that does not distort the
 * number being reported.
 *
 * `daysPerHalf` is returned so a caller can label the figure with the
 * period it actually covers. Several said "week-over-week" about a
 * 14-day comparison.
 */
export type PeriodComparison = {
  recent: number;
  prior: number;
  /** Calendar days in EACH half. Equal by construction. */
  daysPerHalf: number;
  /** Percent change, or null when there is no prior figure to divide by. */
  deltaPct: number | null;
  recentWindow: DayWindow | null;
  priorWindow: DayWindow | null;
};

const EMPTY: PeriodComparison = {
  recent: 0,
  prior: 0,
  daysPerHalf: 0,
  deltaPct: null,
  recentWindow: null,
  priorWindow: null,
};

const MS_PER_DAY = 86_400_000;

function daysInclusive(first: string, last: string): number {
  const a = Date.parse(`${first}T00:00:00Z`);
  const b = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_PER_DAY) + 1;
}

export function comparePeriodHalves<T>(
  rows: readonly T[],
  getDate: (row: T) => string,
  getValue: (row: T) => number,
): PeriodComparison {
  if (rows.length === 0) return EMPTY;

  const dates = rows.map(getDate);
  const sorted = [...dates].sort();
  const span = daysInclusive(sorted[0], sorted[sorted.length - 1]);
  const daysPerHalf = Math.floor(span / 2);
  // One day of data cannot be compared with the day before it when we
  // have no row for that day. Report no delta rather than inventing one.
  if (daysPerHalf < 1) return EMPTY;

  const windows = comparableWindows(dates, daysPerHalf);
  if (!windows) return EMPTY;

  const sum = (w: DayWindow) =>
    rows.reduce((s, row) => {
      const d = getDate(row);
      return d >= w.start && d <= w.end ? s + getValue(row) : s;
    }, 0);

  const recent = sum(windows.current);
  const prior = sum(windows.previous);

  return {
    recent,
    prior,
    daysPerHalf,
    deltaPct: prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null,
    recentWindow: windows.current,
    priorWindow: windows.previous,
  };
}
