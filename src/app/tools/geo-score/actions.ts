"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { runGeoSiteAudit } from "@/lib/geo-audit";
import { tierFor, weights } from "@/lib/geo-audit/data";
import { recordToolRun } from "@/lib/tool-findings";
import { geoNativeScoreFindings } from "@/lib/tool-finding-builders";

export type GeoScoreCategory = {
  score: number;
  weightPct: number;
  note: string;
};

export type GeoScoreState =
  | {
      ok: true;
      url: string;
      composite: number;
      tier: string;
      tierMeaning: string;
      categories: Record<string, GeoScoreCategory>;
      summary: string;
      findingCount: number;
    }
  | { ok: false; error: string }
  | null;

const CATEGORY_ORDER = [
  "citability",
  "technical",
  "schema",
  "content",
  "platform",
] as const;

function summaryFor(composite: number): string {
  if (composite >= 75) {
    return `Strong GEO readiness (${composite}/100). Likely to surface in AI Overviews and answer engines — keep improving the weakest category.`;
  }
  if (composite >= 50) {
    return `Mixed GEO readiness (${composite}/100). Fix the lowest native GEO categories first (citability and technical access matter most).`;
  }
  return `Weak GEO readiness (${composite}/100). Improve passage structure, crawl access, and structured data before expecting AI citations.`;
}

export async function runGeoScore(
  _prev: GeoScoreState,
  formData: FormData,
): Promise<GeoScoreState> {
  const urlRaw = String(formData.get("url") ?? "").trim();
  const clientIdRaw = String(formData.get("clientId") ?? "").trim();
  if (!urlRaw) return { ok: false, error: "URL required." };
  let url: string;
  try {
    url = new URL(/^https?:\/\//i.test(urlRaw) ? urlRaw : `https://${urlRaw}`)
      .toString();
  } catch {
    return { ok: false, error: "Invalid URL." };
  }

  let audit;
  try {
    audit = await runGeoSiteAudit(url, { mode: "quick", maxPages: 1 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GEO audit failed.";
    return { ok: false, error: msg };
  }

  const weightMap = weights();
  const categories: Record<string, GeoScoreCategory> = {};
  for (const key of CATEGORY_ORDER) {
    const score = audit.categoryScores[key] ?? 0;
    const weightPct = weightMap[key]?.weight ?? 0;
    const top = audit.findings.find((f) =>
      f.id.startsWith(`${key}:`) || f.title.toLowerCase().includes(key),
    );
    const note =
      top?.title ??
      (audit.findings.length > 0
        ? `${audit.findings.length} signal(s) on this page`
        : "No blocking signals on the start URL");
    categories[key] = { score, weightPct, note };
  }

  const composite = audit.composite;
  const tier = tierFor(composite);
  const env = audit.envelope as {
    scores?: { tier?: string; tier_meaning?: string };
  };
  const tierLabel = env.scores?.tier ?? tier.label;
  const tierMeaning = env.scores?.tier_meaning ?? tier.meaning;

  let clientId: number | null = null;
  if (clientIdRaw) {
    const cid = Number(clientIdRaw);
    if (Number.isFinite(cid) && cid > 0) {
      const [c] = await db.select().from(clients).where(eq(clients.id, cid)).limit(1);
      if (c) clientId = cid;
    }
  }

  const result: GeoScoreState = {
    ok: true,
    url,
    composite,
    tier: tierLabel,
    tierMeaning,
    categories,
    summary: summaryFor(composite),
    findingCount: audit.findings.length,
  };

  await recordToolRun({
    toolId: "geo-score",
    label: `${url} · ${composite}/100`,
    input: { url, clientId },
    result,
    clientId,
    findings: geoNativeScoreFindings(categories),
  });
  return result;
}
