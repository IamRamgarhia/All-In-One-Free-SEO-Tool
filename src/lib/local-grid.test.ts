import { describe, expect, it } from "vitest";
import { buildGrid, summariseGrid, type GridCell } from "./local-grid";

/**
 * The local grid had no tests at all, and two numbers that lied in the
 * same way the August 2026 audit found elsewhere.
 *
 * `checkRank` does not throw — a captcha comes back as `position: null`
 * with `error` set. The grid read only `position`, so:
 *
 *   - `inPackPct` divided the top-3 count by EVERY cell, counting
 *     blocked cells as "not in the pack". A wholly blocked run, which is
 *     what Google serves a datacentre IP, reported `0%`.
 *   - `avgPosition` divided by the ranked cells only, so the two numbers
 *     on the same card were computed over different denominators and
 *     could contradict each other.
 *   - the history list rendered a never-computed null as `0% in pack`.
 *   - the heatmap's delta labelled a blocked cell **lost** in red
 *     against the previous run.
 *
 * Nothing threw at any point. The user saw a specific, plausible,
 * confident number saying their local visibility had gone.
 */

function cell(position: number | null, error?: string): GridCell {
  return { lat: 0, lng: 0, position, ...(error ? { error } : {}) };
}

const BLOCKED = "Google showed a CAPTCHA.";

describe("summariseGrid", () => {
  it("computes both numbers over the cells that answered", () => {
    const s = summariseGrid([
      cell(1),
      cell(2),
      cell(12),
      cell(null), // checked, genuinely not ranking
    ]);
    expect(s.conclusiveCells).toBe(4);
    expect(s.failedCells).toBe(0);
    // 2 of 4 cells in the top 3.
    expect(s.inPackPct).toBe(50);
    // Averaged over the 3 cells that rank, not the 4 that answered —
    // there is no position to average for the fourth.
    expect(s.avgPosition).toBe(5);
  });

  it("excludes blocked cells from the in-pack denominator", () => {
    // This is the bug. Two cells rank 1-3, two answered "not ranking",
    // and two were blocked. The honest reading is 2 of 4 = 50%.
    const s = summariseGrid([
      cell(1),
      cell(3),
      cell(null),
      cell(null),
      cell(null, BLOCKED),
      cell(null, BLOCKED),
    ]);
    expect(s.conclusiveCells).toBe(4);
    expect(s.failedCells).toBe(2);
    expect(s.inPackPct).toBe(50);
    // The old arithmetic divided by all six and reported 33%.
    expect(s.inPackPct).not.toBe(33);
  });

  it("reports null, not 0%, when nothing could be checked", () => {
    // What this dev machine actually gets from Google. "0% in pack" is
    // a claim about rankings; this is a failure to measure.
    const s = summariseGrid([
      cell(null, BLOCKED),
      cell(null, BLOCKED),
      cell(null, BLOCKED),
    ]);
    expect(s.inPackPct).toBeNull();
    expect(s.avgPosition).toBeNull();
    expect(s.conclusiveCells).toBe(0);
    expect(s.failedCells).toBe(3);
  });

  it("counts a position seen before a block as real", () => {
    // checkRank can return a position AND an error: blocked on page 3
    // after finding the domain on page 1. Presence is evidence however
    // early the scan stopped, so the cell is conclusive.
    const s = summariseGrid([cell(2, BLOCKED), cell(null, BLOCKED)]);
    expect(s.conclusiveCells).toBe(1);
    expect(s.failedCells).toBe(1);
    expect(s.inPackPct).toBe(100);
    expect(s.avgPosition).toBe(2);
  });

  it("survives an empty grid without producing NaN", () => {
    const s = summariseGrid([]);
    expect(s.inPackPct).toBeNull();
    expect(s.avgPosition).toBeNull();
    expect(s.conclusiveCells).toBe(0);
    expect(s.failedCells).toBe(0);
  });

  it("never returns NaN or Infinity for any mix of cells", () => {
    // A percentage rendered as "NaN%" would at least be visible. These
    // assertions are here because the arithmetic above divides by a
    // filtered length, which is the shape that produces one.
    const mixes: GridCell[][] = [
      [],
      [cell(null, BLOCKED)],
      [cell(null)],
      [cell(1)],
      [cell(1), cell(null, BLOCKED)],
      [cell(null, BLOCKED), cell(null)],
    ];
    for (const cells of mixes) {
      const s = summariseGrid(cells);
      for (const v of [s.inPackPct, s.avgPosition]) {
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("buildGrid", () => {
  it("returns size × size cells centred on the given point", () => {
    const cells = buildGrid({ centerLat: 28.6139, centerLng: 77.209, size: 3 });
    expect(cells).toHaveLength(9);
    // The middle cell of an odd grid is the centre itself.
    expect(cells[4].lat).toBeCloseTo(28.6139, 6);
    expect(cells[4].lng).toBeCloseTo(77.209, 6);
  });

  it("spaces cells by roughly the requested distance", () => {
    const cells = buildGrid({
      centerLat: 0, // cos(0) = 1, so lat and lng steps match here
      centerLng: 0,
      size: 3,
      spacingM: 1500,
    });
    const latStep = cells[3].lat - cells[0].lat;
    expect(latStep * 111_320).toBeCloseTo(1500, 0);
  });
});
