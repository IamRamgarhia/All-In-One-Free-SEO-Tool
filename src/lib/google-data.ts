import { fetchGscPerformance, fetchGa4OrganicOverview } from "./google-oauth";

/**
 * High-level helpers built on top of google-oauth's raw fetchers. These return
 * shapes ready for UI consumption (top-N tables, sparkline arrays, quick-wins
 * lists) and gracefully return empty data on failure rather than throwing.
 */

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export type GscKeyword = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function getGscTopQueries(opts: {
  siteUrl: string;
  days?: number;
  limit?: number;
}): Promise<GscKeyword[]> {
  const days = opts.days ?? 28;
  try {
    const rows = await fetchGscPerformance({
      siteUrl: opts.siteUrl,
      startDate: daysAgo(days + 2), // GSC has a ~2 day reporting lag
      endDate: daysAgo(2),
      dimensions: ["query"],
      rowLimit: 200,
    });
    return rows
      .map((r) => ({
        query: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }))
      .filter((k) => k.query)
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, opts.limit ?? 20);
  } catch {
    return [];
  }
}

/**
 * "Quick wins" — keywords where you rank just outside page 1 (positions 4-15)
 * with meaningful impressions. One small content tweak often pushes them onto
 * page 1, where CTR jumps from <2% to 5-12%.
 */
export async function getGscQuickWins(opts: {
  siteUrl: string;
  days?: number;
  limit?: number;
  minImpressions?: number;
}): Promise<GscKeyword[]> {
  const days = opts.days ?? 28;
  const minImpressions = opts.minImpressions ?? 50;
  try {
    const rows = await fetchGscPerformance({
      siteUrl: opts.siteUrl,
      startDate: daysAgo(days + 2),
      endDate: daysAgo(2),
      dimensions: ["query"],
      rowLimit: 1000,
    });
    return rows
      .map((r) => ({
        query: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }))
      .filter(
        (k) =>
          k.query &&
          k.position >= 4 &&
          k.position <= 15 &&
          k.impressions >= minImpressions,
      )
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, opts.limit ?? 12);
  } catch {
    return [];
  }
}

export type CannibalizationGroup = {
  query: string;
  totalClicks: number;
  totalImpressions: number;
  pages: {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
  /** Higher = more harmful overlap (multiple pages competing for the same intent). */
  severity: "high" | "medium" | "low";
};

/**
 * Finds queries where multiple internal URLs are competing in the SERP.
 * Two pages ranking for the same query split clicks and confuse Google about
 * the canonical answer page — the fix is to consolidate or differentiate.
 *
 * Severity:
 *   high   — 3+ pages, OR 2 pages both within the top 20
 *   medium — 2 pages, one in top 20 and one beyond
 *   low    — 2 pages, both beyond position 20 (unlikely to harm meaningfully)
 */
export async function detectKeywordCannibalization(opts: {
  siteUrl: string;
  days?: number;
  minImpressions?: number;
  limit?: number;
}): Promise<CannibalizationGroup[]> {
  const days = opts.days ?? 28;
  const minImpressions = opts.minImpressions ?? 30;
  try {
    const rows = await fetchGscPerformance({
      siteUrl: opts.siteUrl,
      startDate: daysAgo(days + 2),
      endDate: daysAgo(2),
      dimensions: ["query", "page"],
      rowLimit: 5000,
    });

    const grouped = new Map<
      string,
      CannibalizationGroup["pages"]
    >();
    for (const r of rows) {
      const query = r.keys[0] ?? "";
      const page = r.keys[1] ?? "";
      if (!query || !page) continue;
      if (r.impressions < minImpressions) continue;
      const list = grouped.get(query) ?? [];
      list.push({
        page,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      });
      grouped.set(query, list);
    }

    const groups: CannibalizationGroup[] = [];
    for (const [query, pages] of grouped.entries()) {
      if (pages.length < 2) continue;
      pages.sort((a, b) => a.position - b.position);
      const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);
      const totalImpressions = pages.reduce(
        (s, p) => s + p.impressions,
        0,
      );
      const top20 = pages.filter((p) => p.position <= 20).length;
      let severity: CannibalizationGroup["severity"] = "low";
      if (pages.length >= 3 || top20 >= 2) severity = "high";
      else if (top20 >= 1) severity = "medium";
      groups.push({
        query,
        totalClicks,
        totalImpressions,
        pages,
        severity,
      });
    }

    const sevRank = { high: 0, medium: 1, low: 2 };
    groups.sort(
      (a, b) =>
        sevRank[a.severity] - sevRank[b.severity] ||
        b.totalImpressions - a.totalImpressions,
    );

    return groups.slice(0, opts.limit ?? 50);
  } catch {
    return [];
  }
}

export type Ga4DailyTraffic = {
  date: string;
  sessions: number;
  users: number;
  pageviews: number;
};

export type GscPageRow = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/**
 * Page-level GSC data. Returns per-URL clicks/impressions/CTR/position over
 * a date range. Used by the content decay detector to find pages losing
 * traffic period-over-period.
 */
export async function getGscPagePerformance(opts: {
  siteUrl: string;
  startDate: string;
  endDate: string;
  rowLimit?: number;
}): Promise<GscPageRow[]> {
  try {
    const rows = await fetchGscPerformance({
      siteUrl: opts.siteUrl,
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: ["page"],
      rowLimit: opts.rowLimit ?? 1000,
    });
    return rows
      .map((r) => ({
        page: r.keys[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }))
      .filter((p) => p.page);
  } catch {
    return [];
  }
}

export type DecayPage = {
  page: string;
  recentClicks: number;
  priorClicks: number;
  deltaPct: number;
  recentImpressions: number;
  priorImpressions: number;
  recentPosition: number;
  priorPosition: number;
  /** Recovery value score 0-100. Higher = bigger opportunity. */
  recoveryScore: number;
};

function ymdMinus(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Find pages losing traffic. Compares the most recent 28 days against the
 * previous 28-day window (offset back another 28 days, with a 2-day GSC
 * reporting lag).
 *
 * Recovery score weights drop magnitude × prior traffic — a page that lost
 * 30% from 1000 clicks beats a page that lost 50% from 5 clicks.
 */
export async function findContentDecay(opts: {
  siteUrl: string;
  minPriorClicks?: number;
  limit?: number;
}): Promise<DecayPage[]> {
  const minPriorClicks = opts.minPriorClicks ?? 30;
  const limit = opts.limit ?? 25;

  // Recent: last 28 days (with 2-day reporting lag)
  // Prior:  the 28 days before that
  const [recent, prior] = await Promise.all([
    getGscPagePerformance({
      siteUrl: opts.siteUrl,
      startDate: ymdMinus(30),
      endDate: ymdMinus(2),
      rowLimit: 1000,
    }),
    getGscPagePerformance({
      siteUrl: opts.siteUrl,
      startDate: ymdMinus(58),
      endDate: ymdMinus(31),
      rowLimit: 1000,
    }),
  ]);

  const priorByPage = new Map(prior.map((p) => [p.page, p]));

  const decays: DecayPage[] = [];
  for (const r of recent) {
    const p = priorByPage.get(r.page);
    if (!p) continue;
    if (p.clicks < minPriorClicks) continue;
    const delta = r.clicks - p.clicks;
    if (delta >= 0) continue; // gaining or flat — not decay

    const deltaPct = Math.round((delta / p.clicks) * 100);
    // Recovery score: heavier weight on prior traffic, modest weight on % drop
    const recoveryScore = Math.min(
      100,
      Math.round(
        Math.log10(p.clicks + 10) * 14 + Math.abs(deltaPct) * 0.5,
      ),
    );

    decays.push({
      page: r.page,
      recentClicks: r.clicks,
      priorClicks: p.clicks,
      deltaPct,
      recentImpressions: r.impressions,
      priorImpressions: p.impressions,
      recentPosition: r.position,
      priorPosition: p.position,
      recoveryScore,
    });
  }

  decays.sort((a, b) => b.recoveryScore - a.recoveryScore);
  return decays.slice(0, limit);
}

export type Ga4Conversions = {
  conversions: number;
  revenue: number;
};

/**
 * GA4 conversion + revenue totals attributed to organic search over
 * the last N days. Returns null on any error / unconfigured property.
 */
export async function getGa4OrganicConversions(opts: {
  propertyId: string;
  days?: number;
}): Promise<Ga4Conversions | null> {
  const days = opts.days ?? 28;
  try {
    const { fetchGa4OrganicConversions } = await import("./google-oauth");
    return await fetchGa4OrganicConversions({
      propertyId: opts.propertyId,
      startDate: daysAgo(days),
      endDate: daysAgo(0),
    });
  } catch {
    return null;
  }
}

export async function getGa4OrganicTraffic(opts: {
  propertyId: string;
  days?: number;
}): Promise<Ga4DailyTraffic[]> {
  const days = opts.days ?? 28;
  try {
    const rows = await fetchGa4OrganicOverview({
      propertyId: opts.propertyId,
      startDate: daysAgo(days),
      endDate: daysAgo(0),
    });
    return rows
      .map((r) => ({
        // GA4 returns YYYYMMDD — normalise to YYYY-MM-DD for display
        date:
          r.date.length === 8
            ? `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`
            : r.date,
        sessions: r.sessions,
        users: r.users,
        pageviews: r.pageviews,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}
