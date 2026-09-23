"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { scanCwv } from "@/lib/pagespeed";
import { auditEeat } from "@/lib/eeat-audit";
import { scoreAllPassages } from "@/lib/aio-passage-scorer";
import { parseHtmlToMarkdown } from "@/lib/main-content-extractor";
import { fetchCruxData } from "@/lib/crux";
import { recordToolRun } from "@/lib/tool-findings";
import { geoScoreFindings } from "@/lib/tool-finding-builders";
import { guardedFetch } from "@/lib/url-guard";

export type GeoScoreState =
  | {
      ok: true;
      url: string;
      composite: number;
      dimensions: {
        citability: { score: number; weight: number; note: string };
        brandAuthority: { score: number; weight: number; note: string };
        contentEeat: { score: number; weight: number; note: string };
        technical: { score: number; weight: number; note: string };
        schema: { score: number; weight: number; note: string };
        platformTactics: { score: number; weight: number; note: string };
      };
      summary: string;
    }
  | { ok: false; error: string }
  | null;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await guardedFetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
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

  // 1. Citability — score passages from the page content
  const html = await fetchHtml(url);
  let citability = { score: 0, weight: 25, note: "Could not fetch page" };
  if (html) {
    // The scorer reads markdown paragraphs. Handed raw HTML it stripped
    // the tags but kept everything between them, so inline scripts,
    // styles and JSON-LD were scored as prose — the /tools/aio-passage
    // page already extracted first; this one did not.
    const passages = scoreAllPassages(parseHtmlToMarkdown(html).markdown);
    if (passages.length > 0) {
      const avg = Math.round(
        passages.reduce((s, p) => s + p.score, 0) / passages.length,
      );
      const citeReady = passages.filter((p) => p.score >= 70).length;
      citability = {
        score: avg,
        weight: 25,
        note: `${passages.length} passages · ${citeReady} cite-ready (avg ${avg}/100)`,
      };
    } else {
      citability = {
        score: 20,
        weight: 25,
        note: "No extractable passages — page may be JS-rendered",
      };
    }
  }

  // 2. Brand authority — check for sameAs + Wikipedia mention + Organization schema
  let brandAuthority = { score: 30, weight: 20, note: "" };
  if (html) {
    const hasOrg = /"@type"\s*:\s*"Organization"/i.test(html);
    const sameAs = (html.match(/"sameAs"\s*:\s*\[([^\]]+)\]/i)?.[1] ?? "")
      .split(",")
      .filter((s) => /https?:\/\//.test(s)).length;
    const hasWiki = /wikipedia\.org\//i.test(html);
    let s = 20;
    if (hasOrg) s += 15;
    if (sameAs >= 4) s += 25;
    else if (sameAs >= 2) s += 15;
    if (hasWiki) s += 20;
    brandAuthority = {
      score: Math.min(100, s),
      weight: 20,
      note: `Org schema: ${hasOrg ? "✓" : "✗"} · sameAs links: ${sameAs} · Wikipedia link: ${hasWiki ? "✓" : "✗"}`,
    };
  }

  // 3. Content E-E-A-T
  let contentEeat = { score: 30, weight: 20, note: "" };
  try {
    const eeat = await auditEeat({ url });
    if (eeat.score) {
      contentEeat = {
        score: eeat.score.total,
        weight: 20,
        note: `Experience ${eeat.score.experience}/25 · Expertise ${eeat.score.expertise}/25 · Authority ${eeat.score.authority}/25 · Trust ${eeat.score.trust}/25`,
      };
    }
  } catch {
    // fallback
  }

  // 4. Technical foundation — Core Web Vitals from PSI
  let technical = { score: 40, weight: 15, note: "" };
  try {
    const cwv = await scanCwv({ url });
    if (cwv.ok && cwv.performance !== null) {
      technical = {
        score: cwv.performance,
        weight: 15,
        note: `PSI performance ${cwv.performance}/100 · LCP ${cwv.lcpMs ?? "?"}ms · CLS ${cwv.cls !== null ? (cwv.cls / 100).toFixed(3) : "?"}`,
      };
    }
  } catch {
    // fallback
  }

  // 5. Schema completeness — Article + Person + Organization presence
  let schema = { score: 30, weight: 10, note: "" };
  if (html) {
    const hasArticle =
      /"@type"\s*:\s*"(?:Article|BlogPosting|NewsArticle)"/i.test(html);
    const hasPerson = /"@type"\s*:\s*"Person"/i.test(html);
    const hasOrg = /"@type"\s*:\s*"Organization"/i.test(html);
    const hasWebSite = /"@type"\s*:\s*"WebSite"/i.test(html);
    let s = 0;
    if (hasArticle) s += 30;
    if (hasPerson) s += 30;
    if (hasOrg) s += 25;
    if (hasWebSite) s += 15;
    schema = {
      score: Math.min(100, s),
      weight: 10,
      note: `Article ${hasArticle ? "✓" : "✗"} · Person ${hasPerson ? "✓" : "✗"} · Organization ${hasOrg ? "✓" : "✗"} · WebSite ${hasWebSite ? "✓" : "✗"}`,
    };
  }

  // 6. Platform tactics — origin-level CrUX vs URL-level + INP
  let platformTactics = { score: 50, weight: 10, note: "" };
  try {
    const crux = await fetchCruxData({ url });
    if (crux.hasData && crux.metrics.inp) {
      const inp = crux.metrics.inp.p75;
      let s = 50;
      if (inp <= 200) s = 95;
      else if (inp <= 500) s = 60;
      else s = 30;
      platformTactics = {
        score: s,
        weight: 10,
        note: `Field INP p75 ${Math.round(inp)}ms (${s >= 80 ? "great" : s >= 50 ? "needs work" : "poor"})`,
      };
    }
  } catch {
    // fallback
  }

  // Composite (weighted average)
  const composite = Math.round(
    citability.score * (citability.weight / 100) +
      brandAuthority.score * (brandAuthority.weight / 100) +
      contentEeat.score * (contentEeat.weight / 100) +
      technical.score * (technical.weight / 100) +
      schema.score * (schema.weight / 100) +
      platformTactics.score * (platformTactics.weight / 100),
  );

  let summary = "";
  if (composite >= 75) {
    summary = `Strong GEO health (${composite}/100). Page is highly likely to be cited in AI Overviews, ChatGPT, and Perplexity. Maintain — focus on the weakest dimension.`;
  } else if (composite >= 50) {
    summary = `Mixed GEO health (${composite}/100). Address the lowest-scoring dimensions first. Citability + Brand authority drive 45% of the score.`;
  } else {
    summary = `Weak GEO health (${composite}/100). Page is largely invisible to AI search surfaces. Start with passage structure + Person/Organization schema.`;
  }

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
    dimensions: { citability, brandAuthority, contentEeat, technical, schema, platformTactics },
    summary,
  };
  await recordToolRun({
    toolId: "geo-score",
    label: `${url} · ${composite}/100`,
    input: { url, clientId },
    result,
    clientId,
    findings: geoScoreFindings({
      citability,
      brandAuthority,
      contentEeat,
      technical,
      schema,
      platformTactics,
    }),
  });
  return result;
}
