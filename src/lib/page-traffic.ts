/**
 * Per-page Search Console impressions for a property, for ranking work by
 * the traffic a page actually gets (finding-priority.ts).
 *
 * Free data the install already has access to when Search Console is
 * connected; nothing else is consulted and nothing is estimated. Null
 * means "could not ask" (no access, the API refused, no rows, too slow) —
 * never "this site has no traffic" — and callers fall back to severity
 * order and say so.
 */

import type { PagePerf } from "./finding-priority";

/** Long enough for Search Console, short enough not to hold a page. */
const TIMEOUT_MS = 8_000;

export async function loadPageTraffic(gscProperty: string): Promise<PagePerf[] | null> {
  try {
    const { getGscPagePerformance } = await import("./google-data");
    const end = new Date();
    // Two days back: Search Console's reporting lag means the latest days
    // are incomplete, and a half-reported day makes a busy page look quiet.
    end.setUTCDate(end.getUTCDate() - 2);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 28);
    const rows = await Promise.race([
      getGscPagePerformance({
        siteUrl: gscProperty,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        rowLimit: 1000,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (!rows || rows.length === 0) return null;
    return rows.map((r) => ({
      page: r.page,
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    }));
  } catch {
    return null;
  }
}

/** The 28-day window the figures cover, for saying so on screen. */
export const PAGE_TRAFFIC_DAYS = 28;
