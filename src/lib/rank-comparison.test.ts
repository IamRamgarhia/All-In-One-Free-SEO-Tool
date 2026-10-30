import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CROSS_SOURCE_NOTE,
  comparePositions,
  type RankReading,
} from "./rank-comparison";

/**
 * Search Console's average position and a live SERP check are different
 * measurements of different things, and subtracting one from the other
 * invents movement. The rule was stated in schema.ts and honoured in
 * exactly one consumer; these pin it for all of them.
 */

const gsc = (position: number | null): RankReading => ({
  position,
  source: "gsc",
});
const scrape = (position: number | null): RankReading => ({
  position,
  source: "scrape",
});

describe("comparePositions", () => {
  it("reports a drop when both readings are scrapes", () => {
    const r = comparePositions(scrape(7), scrape(12));
    expect(r.comparable).toBe(true);
    expect(r.drop).toBe(5);
    expect(r.gain).toBe(-5);
    expect(r.note).toBeUndefined();
  });

  it("reports a gain with the opposite sign", () => {
    // Both signs are returned because the three call sites had three
    // different conventions, and negating a single `delta` by hand is
    // how a sign bug gets added while fixing a provenance one.
    const r = comparePositions(scrape(12), scrape(7));
    expect(r.drop).toBe(-5);
    expect(r.gain).toBe(5);
  });

  it("refuses to compare a GSC average with a scrape", () => {
    // The bug. #7 from Search Console is an impression-weighted average
    // over days; #12 from a scrape is one SERP from one IP. The old code
    // called this "fell 5 positions" and sent a warning notification.
    const r = comparePositions(gsc(7), scrape(12));
    expect(r.comparable).toBe(false);
    expect(r.drop).toBeNull();
    expect(r.gain).toBeNull();
    expect(r.note).toBe(CROSS_SOURCE_NOTE);
  });

  it("refuses in the other direction too", () => {
    const r = comparePositions(scrape(12), gsc(7));
    expect(r.comparable).toBe(false);
    expect(r.note).toBe(CROSS_SOURCE_NOTE);
  });

  it("compares two GSC readings", () => {
    const r = comparePositions(gsc(3), gsc(4));
    expect(r.comparable).toBe(true);
    expect(r.drop).toBe(1);
  });

  it("will not subtract a missing position", () => {
    // "Not in the top 100" is not a number. Both of these used to come
    // out as a comparison because the guards were per-call-site.
    for (const pair of [
      [scrape(null), scrape(9)],
      [scrape(9), scrape(null)],
      [scrape(null), scrape(null)],
    ] as const) {
      const r = comparePositions(pair[0], pair[1]);
      expect(r.comparable).toBe(false);
      expect(r.drop).toBeNull();
    }
  });

  it("treats a missing reading as incomparable, with no note", () => {
    // A first-ever check has nothing to compare against. That is not a
    // provenance problem, so it gets no user-facing note.
    for (const r of [
      comparePositions(null, scrape(4)),
      comparePositions(scrape(4), undefined),
      comparePositions(undefined, null),
    ]) {
      expect(r.comparable).toBe(false);
      expect(r.note).toBeUndefined();
    }
  });

  it("compares position 1 correctly", () => {
    // The previous inline version in lib/mcp/tools.ts gated on
    // `latest.position && oldest.position`, which is truthiness. Ranks
    // are 1-based so 0 never occurs, but the shape is one typo away
    // from discarding a real reading.
    const r = comparePositions(scrape(1), scrape(1));
    expect(r.comparable).toBe(true);
    expect(r.drop).toBe(0);
  });
});

describe("the rule is not written anywhere else", () => {
  /**
   * Rule 4: every pair of hardcoded lists in this codebase had already
   * drifted by the time it was found. This rule was duplicated between
   * schema.ts prose and lib/mcp/tools.ts code, and the two paths that
   * acted on movement had neither. This fails if a fourth copy appears.
   */
  it("no call site re-implements the source equality check", () => {
    const suspects = [
      "src/app/keywords/rank-actions.ts",
      "src/app/tools/serp-volatility/page.tsx",
      "src/lib/mcp/tools.ts",
    ];
    for (const file of suspects) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("comparePositions");
      // The inline form this replaced, in any spacing.
      expect(src).not.toMatch(/\.source\s*[!=]==\s*\w+\.source/);
    }
  });
});
