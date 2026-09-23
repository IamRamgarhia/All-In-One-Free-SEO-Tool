/**
 * Reading CrUX, on responses shaped like Google's documentation.
 *
 * Constructed from the examples at developer.chrome.com/docs/crux/api
 * and /history-api, not captured: no API key is configured on the
 * machine this was written on. What they pin down is the two documented
 * quirks — CLS percentiles are strings, and history periods without
 * enough data are null — that the code previously mishandled.
 */

import { describe, expect, it } from "vitest";
import { cwvTrend, parseCruxHistory, parseCruxResponse } from "./crux";

describe("the daily API", () => {
  const record = (cls: unknown) => ({
    record: {
      key: { origin: "https://example.com", formFactor: "PHONE" },
      metrics: {
        largest_contentful_paint: {
          histogram: [{ start: 0, end: 2500, density: 0.9 }, { start: 2500, end: 4000, density: 0.06 }, { start: 4000, density: 0.04 }],
          percentiles: { p75: 1600 },
        },
        cumulative_layout_shift: {
          histogram: [{ start: "0.00", end: "0.10", density: 0.8 }],
          percentiles: { p75: cls },
        },
      },
      collectionPeriod: {
        firstDate: { year: 2026, month: 8, day: 9 },
        lastDate: { year: 2026, month: 9, day: 5 },
      },
    },
  });

  it("reads a CLS percentile sent as a string as a number", () => {
    // As a string it reached `.toFixed(3)` on the CrUX page and threw.
    const r = parseCruxResponse(record("0.05") as never, "origin");
    expect(r.metrics.cls?.p75).toBe(0.05);
    expect(typeof r.metrics.cls?.p75).toBe("number");
  });

  it("treats a missing percentile as no data, not as a perfect 0", () => {
    const r = parseCruxResponse(record(undefined) as never, "origin");
    expect(r.metrics.cls).toBeUndefined();
    expect(r.metrics.lcp?.p75).toBe(1600);
  });
});

describe("the history API", () => {
  const body = {
    record: {
      key: { origin: "https://example.com", formFactor: "PHONE" },
      metrics: {
        largest_contentful_paint: { percentilesTimeseries: { p75s: [1362, null, 1344, 1356, 1366, 1377] } },
        cumulative_layout_shift: { percentilesTimeseries: { p75s: ["0.05", null, "0.06", "0.05", "0.07", "0.08"] } },
      },
      collectionPeriods: [
        { firstDate: { year: 2026, month: 7, day: 11 }, lastDate: { year: 2026, month: 8, day: 7 } },
        { firstDate: { year: 2026, month: 7, day: 18 }, lastDate: { year: 2026, month: 8, day: 14 } },
      ],
    },
  };

  it("keeps a period without enough data as null, in its place", () => {
    const h = parseCruxHistory(body, "origin");
    expect(h.metrics.lcp?.p75s).toEqual([1362, null, 1344, 1356, 1366, 1377]);
  });

  it("reads CLS strings as numbers across the series", () => {
    expect(parseCruxHistory(body, "origin").metrics.cls?.p75s).toEqual([0.05, null, 0.06, 0.05, 0.07, 0.08]);
  });

  it("formats the collection periods as dates", () => {
    expect(parseCruxHistory(body, "origin").periods[1]).toEqual({ start: "2026-07-18", end: "2026-08-14" });
  });

  it("reports no data when there is no record", () => {
    expect(parseCruxHistory({}, "url")).toMatchObject({ hasData: false, metrics: {} });
  });
});

describe("trend", () => {
  const periods = Array.from({ length: 8 }, (_, k) => ({ start: `p${k}s`, end: `p${k}e` }));

  it("compares with the window four weeks back, the nearest with no shared days", () => {
    const t = cwvTrend([2000, 2100, 2200, 2400, 2400, 2500, 2600, 3000], periods);
    expect(t.earlier).toBe(2400);
    expect(t.earlierPeriod).toEqual({ start: "p3s", end: "p3e" });
    expect(t.changePct).toBe(25);
    expect(t.regressed).toBe(true);
  });

  it("does not flag exactly 20%, or an improvement", () => {
    expect(cwvTrend([0, 0, 0, 1000, 0, 0, 0, 1200], periods).regressed).toBe(false);
    expect(cwvTrend([0, 0, 0, 1000, 0, 0, 0, 700], periods)).toMatchObject({ changePct: -30, regressed: false });
  });

  it("gives no change when either end has no data", () => {
    expect(cwvTrend([0, 0, 0, null, 0, 0, 0, 1200], periods)).toMatchObject({ changePct: null, regressed: false });
    expect(cwvTrend([0, 0, 0, 1000, 0, 0, 0, null], periods)).toMatchObject({ latest: null, changePct: null });
  });

  it("gives no earlier value with fewer than five periods", () => {
    expect(cwvTrend([1, 2, 3], periods.slice(0, 3))).toMatchObject({ earlier: null, changePct: null });
  });
});
