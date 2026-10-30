import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { comparePeriodHalves } from "./period-compare";

/**
 * Period-over-period traffic deltas were computed five separate times
 * with the same four lines, and the same two bugs:
 *
 *   const half = Math.floor(rows.length / 2);
 *   rows.slice(half)      // one LONGER than the other half when odd
 *   rows.slice(0, half)
 *
 * getGa4OrganicTraffic fetches daysAgo(28)..daysAgo(0), 29 inclusive
 * days, so a complete response is always odd and the recent half always
 * got 15 days against 14 — about +7% on perfectly flat traffic. One of
 * the five is the figure printed in the client's PDF report.
 *
 * Splitting on row index is also wrong even when the count is even: GA4
 * omits days with no data, so equal row counts can span unequal numbers
 * of calendar days.
 */

type Row = { date: string; sessions: number };

/** n consecutive days from `start`, each with `per` sessions. */
function flat(start: string, n: number, per: number): Row[] {
  const out: Row[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push({ date: d.toISOString().slice(0, 10), sessions: per });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const compare = (rows: Row[]) =>
  comparePeriodHalves(
    rows,
    (r) => r.date,
    (r) => r.sessions,
  );

describe("comparePeriodHalves", () => {
  it("reports no change on flat traffic over an odd span", () => {
    // The bug, at the size it actually occurs: 29 days of identical
    // traffic. The old index split gave 15 days vs 14 and reported +7%.
    const rows = flat("2026-10-01", 29, 100);
    const r = compare(rows);
    expect(r.daysPerHalf).toBe(14);
    expect(r.recent).toBe(1400);
    expect(r.prior).toBe(1400);
    expect(r.deltaPct).toBe(0);
  });

  it("reports no change on flat traffic over a 7-day span", () => {
    // Worst case: the old split was 4 days against 3, so flat traffic
    // read as +33%.
    const r = compare(flat("2026-10-01", 7, 10));
    expect(r.daysPerHalf).toBe(3);
    expect(r.recent).toBe(30);
    expect(r.prior).toBe(30);
    expect(r.deltaPct).toBe(0);
  });

  it("drops the oldest day rather than distorting the comparison", () => {
    // 29 days cannot be halved. The oldest day is excluded from both
    // windows; the windows themselves stay equal and adjacent.
    const r = compare(flat("2026-10-01", 29, 100));
    expect(r.priorWindow).toEqual({
      start: "2026-10-02",
      end: "2026-10-15",
      days: 14,
    });
    expect(r.recentWindow).toEqual({
      start: "2026-10-16",
      end: "2026-10-29",
      days: 14,
    });
  });

  it("measures a real halving as -50%", () => {
    const rows = [...flat("2026-10-01", 14, 100), ...flat("2026-10-15", 14, 50)];
    const r = compare(rows);
    expect(r.prior).toBe(1400);
    expect(r.recent).toBe(700);
    expect(r.deltaPct).toBe(-50);
  });

  it("measures a real doubling as +100%", () => {
    const rows = [...flat("2026-10-01", 14, 50), ...flat("2026-10-15", 14, 100)];
    expect(compare(rows).deltaPct).toBe(100);
  });

  it("splits by date, so a gap does not shift the window", () => {
    // GA4 returns no row for a zero-session day. Index splitting would
    // put the boundary in the wrong place; date splitting does not.
    const full = flat("2026-10-01", 28, 100);
    const withGap = full.filter(
      (r) => r.date !== "2026-10-03" && r.date !== "2026-10-05",
    );
    const r = compare(withGap);
    // Same 14/14 windows as the complete set...
    expect(r.recentWindow).toEqual(compare(full).recentWindow);
    // ...and the two missing days count as the zero they were.
    expect(r.prior).toBe(1200);
    expect(r.recent).toBe(1400);
    // Which is a genuine rise: the prior fortnight really had 2 days of
    // no traffic. The point is that it is 12/14 vs 14/14, not a boundary
    // that moved.
    expect(r.deltaPct).toBe(17);
  });

  it("returns no delta rather than a wrong one for thin data", () => {
    expect(compare([]).deltaPct).toBeNull();
    expect(compare(flat("2026-10-01", 1, 10)).deltaPct).toBeNull();
    // Two days = one day each side, which is comparable.
    expect(compare(flat("2026-10-01", 2, 10)).daysPerHalf).toBe(1);
  });

  it("returns no delta when the prior period is zero", () => {
    const rows = [...flat("2026-10-01", 14, 0), ...flat("2026-10-15", 14, 100)];
    // Dividing by zero would be Infinity, and Math.round(Infinity) is
    // Infinity, which renders as "Infinity%".
    expect(compare(rows).deltaPct).toBeNull();
  });

  it("never produces NaN or Infinity", () => {
    const cases: Row[][] = [
      [],
      flat("2026-10-01", 1, 0),
      flat("2026-10-01", 2, 0),
      flat("2026-10-01", 29, 0),
      [{ date: "not-a-date", sessions: 5 }],
    ];
    for (const rows of cases) {
      const r = compare(rows);
      if (r.deltaPct !== null) expect(Number.isFinite(r.deltaPct)).toBe(true);
      expect(Number.isFinite(r.recent)).toBe(true);
      expect(Number.isFinite(r.prior)).toBe(true);
    }
  });

  it("tolerates unsorted rows", () => {
    const rows = [...flat("2026-10-01", 28, 100)].reverse();
    expect(compare(rows).deltaPct).toBe(0);
  });
});

describe("no call site keeps its own index split", () => {
  /**
   * Rule 4. These five files each had the same four lines; a sixth copy
   * would drift the same way. The index split is the thing to keep out,
   * so this looks for its shape rather than for a correct alternative.
   */
  const CALLERS = [
    "src/lib/report-generator.ts",
    "src/lib/dashboard-data.ts",
    "src/app/reports/c/[clientId]/preview-actions.ts",
    "src/app/clients/[id]/organic-traffic-panel.tsx",
  ];

  it.each(CALLERS)("%s uses the shared helper", (file) => {
    expect(readFileSync(file, "utf8")).toContain("comparePeriodHalves");
  });

  it.each(CALLERS)("%s no longer slices on a half index", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/\.slice\(\s*half/i);
    expect(src).not.toMatch(/Math\.floor\(\s*\w+(\.\w+)*\.length\s*\/\s*2\s*\)/);
  });
});

describe("the daily traffic-drop alert compares equal windows", () => {
  /**
   * Search Console date ranges are inclusive, so ymd(9)..ymd(2) is 8
   * days and ymd(16)..ymd(10) is 7. The recent half was inflated 8/7, a
   * real 10% weekly drop read as +2.9% growth, and the >=10% alert only
   * fired at about a 21% real drop.
   *
   * The offsets are read out of the source because the step needs
   * Search Console credentials to run. Matched on `startDate:` /
   * `endDate:` rather than on every `ymd(n)` in the region: the first
   * draft of this test matched the prose in the comment above the calls
   * and failed on correct code.
   */
  it("both windows are 7 inclusive days, back to back", () => {
    const src = readFileSync("src/lib/daily-agent.ts", "utf8");
    const step = src.slice(src.indexOf("async function trafficDropAlertStep"));
    const bounds = [
      ...step.matchAll(/(startDate|endDate):\s*ymd\((\d+)\)/g),
    ].map((m) => ({ which: m[1], offset: Number(m[2]) }));

    // Two calls: recent then prior, each with a start and an end.
    expect(bounds.map((b) => b.which)).toEqual([
      "startDate",
      "endDate",
      "startDate",
      "endDate",
    ]);
    const [recentStart, recentEnd, priorStart, priorEnd] = bounds.map(
      (b) => b.offset,
    );

    // Offsets count backwards, so an inclusive span is start - end + 1.
    const inclusiveDays = (from: number, to: number) => from - to + 1;
    expect(inclusiveDays(recentStart, recentEnd)).toBe(7);
    expect(inclusiveDays(priorStart, priorEnd)).toBe(7);
    // Adjacent: the prior window ends the day before the recent begins.
    expect(priorEnd).toBe(recentStart + 1);
  });
});
