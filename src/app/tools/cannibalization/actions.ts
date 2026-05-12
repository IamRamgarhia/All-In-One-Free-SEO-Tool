"use server";

import { fetchGscPerformance } from "@/lib/google-oauth";
import { saveToolRun } from "@/lib/tool-runs";

export type CannibalGroup = {
  query: string;
  pages: {
    page: string;
    clicks: number;
    impressions: number;
    position: number;
    ctr: number;
  }[];
  totalClicks: number;
  totalImpressions: number;
  /** The single page that should "win" — currently the one with the best position. */
  recommendedKeeper: string;
  severity: "high" | "medium" | "low";
};

export type CannibalState =
  | {
      ok: true;
      siteUrl: string;
      groups: CannibalGroup[];
      summary: {
        groupsFound: number;
        highSeverity: number;
        queriesAnalyzed: number;
      };
    }
  | { ok: false; error: string };

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Cannibalization is when ≥2 pages on the same site compete for the
 * same query — Google can't decide which to rank, both suffer. We
 * detect it from GSC: pull 28 days of query + page data, bucket by
 * query, flag any query where 2+ pages each pull ≥5 impressions and
 * average position is in the top 30.
 *
 * Severity:
 *   high — ≥2 pages each with ≥10 impressions, all in top 20
 *   medium — ≥2 pages each with ≥10 impressions, mixed positions
 *   low — pages compete but one is clearly winning
 *
 * The recommended keeper is the page with the best (lowest) average
 * position — usually the one Google is leaning toward anyway. The fix
 * is then: consolidate the other pages via canonical or 301, or
 * differentiate their content + intent.
 */
export async function runCannibalScan(
  _prev: CannibalState | null,
  formData: FormData,
): Promise<CannibalState> {
  const siteUrl = String(formData.get("site") ?? "").trim();
  if (!siteUrl) return { ok: false, error: "Pick a GSC property." };

  try {
    const rows = await fetchGscPerformance({
      siteUrl,
      startDate: daysAgo(28),
      endDate: daysAgo(1),
      dimensions: ["query", "page"],
      rowLimit: 5000,
    });

    // Bucket by query → pages
    const byQuery = new Map<
      string,
      Map<
        string,
        { clicks: number; impressions: number; position: number; ctr: number }
      >
    >();
    for (const r of rows) {
      const [query, page] = r.keys;
      if (!query || !page) continue;
      const pages = byQuery.get(query) ?? new Map();
      pages.set(page, {
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
        ctr: r.ctr,
      });
      byQuery.set(query, pages);
    }

    const groups: CannibalGroup[] = [];
    for (const [query, pageMap] of byQuery.entries()) {
      const pages = Array.from(pageMap.entries())
        .filter(([, v]) => v.impressions >= 5 && v.position <= 30)
        .map(([page, v]) => ({ page, ...v }));
      if (pages.length < 2) continue;

      // Sort by best (lowest) position first
      pages.sort((a, b) => a.position - b.position);

      const seriousCompetitors = pages.filter((p) => p.impressions >= 10);
      const allTop20 = pages.every((p) => p.position <= 20);
      const severity: CannibalGroup["severity"] =
        seriousCompetitors.length >= 2 && allTop20
          ? "high"
          : seriousCompetitors.length >= 2
            ? "medium"
            : "low";

      groups.push({
        query,
        pages,
        totalClicks: pages.reduce((s, p) => s + p.clicks, 0),
        totalImpressions: pages.reduce((s, p) => s + p.impressions, 0),
        recommendedKeeper: pages[0].page,
        severity,
      });
    }

    // Most impactful (most clicks at stake) first, with severity tiebreaker
    const severityRank = { high: 0, medium: 1, low: 2 } as const;
    groups.sort((a, b) => {
      const s = severityRank[a.severity] - severityRank[b.severity];
      if (s !== 0) return s;
      return b.totalClicks - a.totalClicks;
    });

    const highSeverity = groups.filter((g) => g.severity === "high").length;

    await saveToolRun({
      toolId: "cannibalization",
      label: `${siteUrl} · ${groups.length} group${groups.length === 1 ? "" : "s"} · ${highSeverity} high`,
      input: { siteUrl },
      result: {
        groupsFound: groups.length,
        highSeverity,
        queriesAnalyzed: byQuery.size,
      },
    }).catch(() => undefined);

    return {
      ok: true,
      siteUrl,
      groups: groups.slice(0, 50),
      summary: {
        groupsFound: groups.length,
        highSeverity,
        queriesAnalyzed: byQuery.size,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "GSC fetch failed.";
    return { ok: false, error: message };
  }
}
