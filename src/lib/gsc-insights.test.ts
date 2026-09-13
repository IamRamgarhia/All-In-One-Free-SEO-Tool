/**
 * Shaping Search Console rows into comparisons and an indexing audit.
 *
 * Rows are constructed in the shape the Search Analytics API documents
 * (keys, clicks, impressions, ctr, position); no live property is needed
 * to test the arithmetic.
 */

import { describe, expect, it } from "vitest";
import {
  comparableWindows,
  comparePeriods,
  summariseInspections,
  topPagesByImpressions,
  windowTotals,
  type GscRow,
  type InspectionFacts,
} from "./gsc-insights";

const row = (key: string, clicks: number, impressions: number, position = 5): GscRow => ({
  keys: [key],
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

describe("comparison windows", () => {
  it("ends on the newest finished day, not on yesterday", () => {
    // The newest final date is three days old; a calendar "last 7 days"
    // would include days Google has not finished counting.
    const w = comparableWindows(["2026-09-08", "2026-09-10", "2026-09-09"], 7)!;
    expect(w.current).toEqual({ start: "2026-09-04", end: "2026-09-10", days: 7 });
    expect(w.previous).toEqual({ start: "2026-08-28", end: "2026-09-03", days: 7 });
  });

  it("makes the windows touch without overlapping", () => {
    const w = comparableWindows(["2026-03-01"], 28)!;
    const dayAfter = new Date(`${w.previous.end}T00:00:00Z`);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    expect(dayAfter.toISOString().slice(0, 10)).toBe(w.current.start);
  });

  it("returns nothing when Search Console had no finished days", () => {
    expect(comparableWindows([], 7)).toBeNull();
  });
});

describe("window totals", () => {
  const days = [row("2026-09-01", 10, 100, 4), row("2026-09-02", 30, 300, 8), row("2026-08-01", 999, 999, 1)];
  const w = { start: "2026-09-01", end: "2026-09-07", days: 7 };

  it("adds up only the days inside the window", () => {
    expect(windowTotals(days, w)).toMatchObject({ clicks: 40, impressions: 400, daysWithData: 2 });
  });

  it("weights average position by impressions", () => {
    // (4×100 + 8×300) / 400 = 7, not the plain mean of 6.
    expect(windowTotals(days, w).averagePosition).toBe(7);
  });

  it("gives no CTR or position for a window with no impressions", () => {
    expect(windowTotals([], w)).toMatchObject({ clicks: 0, ctr: null, averagePosition: null });
  });
});

describe("gainers and losers", () => {
  const current = [row("kraft tape", 50, 900), row("bopp tape", 5, 400), row("new query", 7, 70)];
  const previous = [row("kraft tape", 20, 800), row("bopp tape", 40, 500), row("lost query", 9, 60)];
  const { gainers, losers } = comparePeriods(current, previous);

  it("ranks by the size of the click change", () => {
    expect(gainers.map((g) => g.key)).toEqual(["kraft tape", "new query"]);
    expect(losers.map((l) => l.key)).toEqual(["bopp tape", "lost query"]);
  });

  it("counts a query missing from one period as zero there, with no position", () => {
    const lost = losers.find((l) => l.key === "lost query")!;
    expect(lost).toMatchObject({ clicks: 0, previousClicks: 9, clickChange: -9, position: null });
  });
});

describe("choosing pages to inspect", () => {
  it("takes the most-seen pages, not the most-clicked", () => {
    const rows = [row("/a", 90, 100), row("/b", 1, 5000), row("/c", 40, 900)];
    expect(topPagesByImpressions(rows, 2)).toEqual(["/b", "/c"]);
  });
});

describe("indexing audit", () => {
  const base: InspectionFacts = {
    url: "",
    verdict: "PASS",
    coverageState: "Submitted and indexed",
    indexingState: "INDEXING_ALLOWED",
    robotsTxtState: "ALLOWED",
    pageFetchState: "SUCCESSFUL",
    googleCanonical: null,
    userCanonical: null,
  };
  const audit = summariseInspections([
    { ...base, url: "https://x.example/", googleCanonical: "https://x.example/", userCanonical: "https://x.example/" },
    {
      ...base,
      url: "https://x.example/tape?colour=brown",
      verdict: "NEUTRAL",
      coverageState: "Duplicate, Google chose different canonical than user",
      googleCanonical: "https://x.example/tape",
      userCanonical: "https://x.example/tape?colour=brown",
    },
    {
      ...base,
      url: "https://x.example/private",
      verdict: "NEUTRAL",
      coverageState: "Blocked by robots.txt",
      robotsTxtState: "DISALLOWED",
      pageFetchState: "BLOCKED_ROBOTS_TXT",
    },
    { ...base, url: "https://x.example/draft", verdict: "NEUTRAL", coverageState: "Excluded by 'noindex' tag", indexingState: "BLOCKED_BY_META_TAG" },
    { ...base, url: "https://x.example/broken", error: "403 The caller does not have permission" },
  ]);

  it("counts every page inspected, including the one that failed", () => {
    expect(audit.inspected).toBe(5);
    expect(audit.couldNotInspect).toEqual([{ url: "https://x.example/broken", error: "403 The caller does not have permission" }]);
  });

  it("reports indexed only on Google's PASS verdict", () => {
    expect(audit.indexed).toEqual(["https://x.example/"]);
    expect(audit.notIndexed).toHaveLength(3);
  });

  it("names the page where Google overrode the declared canonical", () => {
    expect(audit.canonicalMismatch).toEqual([
      {
        url: "https://x.example/tape?colour=brown",
        declared: "https://x.example/tape?colour=brown",
        googleChose: "https://x.example/tape",
      },
    ]);
  });

  it("gives the cause alongside 'not indexed'", () => {
    expect(audit.blockedByRobotsTxt).toEqual(["https://x.example/private"]);
    expect(audit.fetchProblems).toEqual([{ url: "https://x.example/private", pageFetchState: "BLOCKED_ROBOTS_TXT" }]);
    expect(audit.noindex).toEqual([{ url: "https://x.example/draft", indexingState: "BLOCKED_BY_META_TAG" }]);
  });
});
