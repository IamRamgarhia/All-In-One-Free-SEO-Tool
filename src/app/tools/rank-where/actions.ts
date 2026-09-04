"use server";

import { scanSerp } from "@/lib/serp-scanner";
import { saveToolRun } from "@/lib/tool-runs";

export type RankWhereResult = {
  domain: string;
  query: string;
  country: string;
  topN: number;
  /** Position 1-N if found, null if not in top N. */
  position: number | null;
  /** The exact URL that ranks. */
  rankingUrl: string | null;
  /** The page title that ranks. */
  rankingTitle: string | null;
  /** Competitors at #1, #2, #3 (or just below your position). */
  topCompetitors: { position: number; domain: string; url: string; title: string }[];
  /** Competitors directly above (your "outrank these next" list). */
  outrankTargets: { position: number; domain: string; url: string; title: string }[];
  /** Whether AI Overview is present for this query. */
  aiOverviewPresent: boolean;
  /** Whether you're cited in the AI Overview. */
  citedInAiOverview: boolean;
  /** Featured snippet info. */
  featuredSnippet: { domain: string; url: string } | null;
  /** Concrete fix recommendations. */
  recommendations: string[];
};

export type RankWhereState =
  | { ok: true; result: RankWhereResult }
  | { ok: false; error: string }
  | null;

function normalizeDomain(d: string): string {
  return d
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export async function checkRank(
  _prev: RankWhereState,
  formData: FormData,
): Promise<RankWhereState> {
  const domain = normalizeDomain(String(formData.get("domain") ?? ""));
  const query = String(formData.get("query") ?? "").trim();
  const country = String(formData.get("country") ?? "US").trim().toUpperCase();
  const topNRaw = Number(formData.get("topN") ?? 100);
  const topN = ([10, 20, 50, 100].includes(topNRaw) ? topNRaw : 100) as
    | 10
    | 20
    | 50
    | 100;

  if (!domain) return { ok: false, error: "Domain required." };
  if (!query) return { ok: false, error: "Keyword required." };

  const serp = await scanSerp({
    query,
    country,
    clientDomain: domain,
    topN,
  });
  if (!serp.ok) {
    return {
      ok: false,
      error: serp.error ?? "Couldn't fetch SERP. Try again in a minute.",
    };
  }

  // Find domain in results
  const found = serp.topResults.find((r) =>
    normalizeDomain(r.domain) === domain ||
    normalizeDomain(r.domain).endsWith("." + domain),
  );

  const top3 = serp.topResults.slice(0, 3).map((r) => ({
    position: r.position,
    domain: r.domain,
    url: r.url,
    title: r.title,
  }));

  // Outrank targets — 3 competitors immediately above
  let outrankTargets: typeof top3 = [];
  if (found) {
    outrankTargets = serp.topResults
      .filter((r) => r.position < found.position)
      .slice(-3)
      .map((r) => ({
        position: r.position,
        domain: r.domain,
        url: r.url,
        title: r.title,
      }));
  } else {
    outrankTargets = top3;
  }

  const citedInAiOverview = !!(
    serp.aiOverviewSources &&
    serp.aiOverviewSources.some((src) =>
      normalizeDomain(src) === domain ||
      normalizeDomain(src).endsWith("." + domain),
    )
  );

  // Recommendations
  const recommendations: string[] = [];
  if (!found) {
    recommendations.push(
      `Not in top ${topN} for "${query}" in ${country}. Start with content audit: do you have a page targeting this query at all?`,
    );
    recommendations.push(
      "Build a dedicated landing page for this query — BlogPilot can draft it from the SERP.",
    );
    if (
      top3.length > 0 &&
      top3.some((c) => /reddit\.com|wikipedia\.org|youtube\.com/i.test(c.domain))
    ) {
      recommendations.push(
        "The SERP has Wikipedia/Reddit/YouTube in top 3 — entrenched. You'll likely never beat them; instead target long-tail variants or capture Reddit/YouTube real estate directly.",
      );
    }
  } else if (found.position > 10) {
    recommendations.push(
      `Currently at #${found.position}. You're on page ${Math.ceil(found.position / 10)} — needs major work to crack page 1.`,
    );
    recommendations.push(
      "Run the GEO composite score (/tools/geo-score) on the ranking page to find the weakest dimension.",
    );
    recommendations.push(
      "Run the AIO passage optimizer (/tools/aio-passage) — if AI Overview is present, the cited result usually outranks others.",
    );
  } else if (found.position > 3) {
    recommendations.push(
      `Solid position #${found.position} — striking distance. Refresh the page's content, add more E-E-A-T signals, target the 134-167 word AIO passages.`,
    );
    recommendations.push(
      "Use the /tools/refresh detector to find specific gaps vs the top 3 ranking pages.",
    );
  } else {
    recommendations.push(
      `Already at #${found.position}. Maintain — focus on freshness (update content quarterly) and earn 1-2 new authoritative backlinks.`,
    );
  }
  if (serp.aiOverviewPresent && !citedInAiOverview) {
    recommendations.push(
      "AI Overview triggers for this query but you're NOT cited. Add Article + Person schema, build 134-167 word self-contained answer passages.",
    );
  }
  if (
    !found &&
    serp.featuredSnippet &&
    normalizeDomain(serp.featuredSnippet.url).includes(domain)
  ) {
    recommendations.push(
      "Featured snippet is yours but you don't show in classic top 10 — Google may be using a different page. Audit which URL holds the snippet.",
    );
  }

  const result: RankWhereResult = {
    domain,
    query,
    country,
    topN,
    position: found?.position ?? null,
    rankingUrl: found?.url ?? null,
    rankingTitle: found?.title ?? null,
    topCompetitors: top3,
    outrankTargets,
    aiOverviewPresent: serp.aiOverviewPresent,
    citedInAiOverview,
    featuredSnippet: serp.featuredSnippet
      ? {
          domain: serp.featuredSnippet.url
            ? new URL(serp.featuredSnippet.url).hostname.replace(/^www\./, "")
            : "",
          url: serp.featuredSnippet.url,
        }
      : null,
    recommendations,
  };
  await saveToolRun({
    toolId: "rank-where",
    label: `${domain} · "${query}" (${country}) · ${found ? `#${found.position}` : `not in top ${topN}`}`,
    input: { domain, query, country, topN },
    result: { ok: true, result },
  }).catch(() => undefined);
  return { ok: true, result };
}
