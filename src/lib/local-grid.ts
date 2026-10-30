/**
 * Local pack rank heatmap. Generates a NxN grid of geo-points around a
 * city centre, then runs a SERP check at each point using Google's
 * `&uule=` parameter (which encodes "search from this location").
 *
 * Uses the existing rank-checker browser pool. Points spaced ~1.5 km
 * apart by default — covers a 6 km × 6 km area on a 5×5 grid, which
 * matches what most local-SEO tools call "neighbourhood-level" rank.
 */

import { checkRank, type RankCheckResult } from "./rank-checker";

export type GridCell = {
  lat: number;
  lng: number;
  position: number | null;
  /**
   * Why this cell has no position, when "no position" is not an answer.
   *
   * `position: null` meant two unrelated things and this grid used to
   * conflate them: the check ran and the domain is genuinely outside the
   * local pack here, or the check never produced an answer at all.
   * `checkRank` does not throw — it returns `position: null` with
   * `error` set — so a captcha, a consent wall or a dead network
   * arrived looking exactly like a real miss.
   *
   * Undefined means we got an answer. A string means we did not.
   */
  error?: string;
};

export type GridResult = {
  query: string;
  centerLat: number;
  centerLng: number;
  gridSize: number;
  spacingM: number;
  cells: GridCell[];
  /** Average position across the cells where the domain ranks at all. */
  avgPosition: number | null;
  /**
   * Share of *conclusive* cells in the top 3, or null when no cell was
   * conclusive. Never a share of all cells: a blocked check is not
   * evidence of absence, and counting one as "not in the pack" reported
   * local visibility as collapsed when Google had shown us a captcha.
   */
  inPackPct: number | null;
  /** Cells that produced an answer, and cells that did not. */
  conclusiveCells: number;
  failedCells: number;
  ranAt: Date;
};

/**
 * Build the lat/lng coordinates for an NxN grid. Latitude conversion is
 * straightforward (1 degree ≈ 111.32 km), longitude depends on latitude
 * (cos(lat) factor).
 */
export function buildGrid(opts: {
  centerLat: number;
  centerLng: number;
  size?: number;
  spacingM?: number;
}): { lat: number; lng: number }[] {
  const size = opts.size ?? 5;
  const spacingM = opts.spacingM ?? 1500;
  const half = (size - 1) / 2;

  const latStepDeg = spacingM / 111_320;
  const lngStepDeg =
    spacingM / (111_320 * Math.cos((opts.centerLat * Math.PI) / 180));

  const out: { lat: number; lng: number }[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      out.push({
        lat: opts.centerLat + (row - half) * latStepDeg,
        lng: opts.centerLng + (col - half) * lngStepDeg,
      });
    }
  }
  return out;
}

/**
 * Run a rank check at every grid cell. We do them serially (with the
 * shared headless browser context) to avoid Google's bot detection
 * triggering on parallel hits.
 *
 * Each cell's rank check is the existing rank-checker invoked with
 * `city = "near <lat>,<lng>"` — Google interprets the substring as a
 * location-anchored query. Cleaner than the full `uule=` encoding and
 * more reliable for browser-mode.
 */
export async function runLocalGrid(opts: {
  query: string;
  domain: string;
  centerLat: number;
  centerLng: number;
  size?: number;
  spacingM?: number;
  country?: string;
  language?: string;
}): Promise<GridResult> {
  const cells = buildGrid({
    centerLat: opts.centerLat,
    centerLng: opts.centerLng,
    size: opts.size,
    spacingM: opts.spacingM,
  });

  const results: GridCell[] = [];
  for (const c of cells) {
    try {
      const r: RankCheckResult = await checkRank(opts.query, opts.domain, {
        country: opts.country,
        language: opts.language,
        city: `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`,
      });
      results.push({
        lat: c.lat,
        lng: c.lng,
        position: r.position,
        // checkRank reports a captcha, a consent wall or a transport
        // failure this way rather than throwing, so this is the only
        // place the distinction still exists. Dropping it here is what
        // turned a blocked run into "0% in the pack".
        ...(r.error ? { error: r.error } : {}),
      });
    } catch (err) {
      // Defensive: checkRank is not supposed to throw. If it ever does,
      // the cell is unknown, not absent.
      results.push({
        lat: c.lat,
        lng: c.lng,
        position: null,
        error: (err as Error).message || "Rank check failed",
      });
    }
  }

  const stats = summariseGrid(results);

  return {
    query: opts.query,
    centerLat: opts.centerLat,
    centerLng: opts.centerLng,
    gridSize: opts.size ?? 5,
    spacingM: opts.spacingM ?? 1500,
    cells: results,
    ...stats,
    ranAt: new Date(),
  };
}

/**
 * Reduce the cells to the two numbers the UI shows.
 *
 * Separate and pure so the arithmetic is testable without a browser —
 * the whole bug here was arithmetic over the wrong set.
 *
 * A cell is *conclusive* when it tells us something: either we saw a
 * position (presence is evidence even from a scan that was cut short)
 * or the check completed without error (absence is evidence only then).
 * Everything else is unknown, and unknown is excluded from the
 * denominator rather than counted as a miss.
 */
export function summariseGrid(cells: GridCell[]): {
  avgPosition: number | null;
  inPackPct: number | null;
  conclusiveCells: number;
  failedCells: number;
} {
  const conclusive = cells.filter((c) => c.position !== null || !c.error);
  const ranked = cells.filter((c) => c.position !== null);
  const inPack = ranked.filter((c) => (c.position ?? 0) <= 3).length;

  return {
    avgPosition:
      ranked.length > 0
        ? Math.round(
            ranked.reduce((s, c) => s + (c.position ?? 0), 0) / ranked.length,
          )
        : null,
    inPackPct:
      conclusive.length > 0
        ? Math.round((inPack / conclusive.length) * 100)
        : null,
    conclusiveCells: conclusive.length,
    failedCells: cells.length - conclusive.length,
  };
}
