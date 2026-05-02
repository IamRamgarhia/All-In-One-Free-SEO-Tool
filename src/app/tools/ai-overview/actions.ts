"use server";

import { fetchSiteMetadata } from "@/lib/site-metadata";
import { callAI } from "@/lib/ai-call";

export type AiOverviewAnalysis =
  | {
      ok: true;
      url: string;
      title: string | null;
      description: string | null;
      verdict: string;
      citationScore: number; // 0-100
      strengths: string[];
      weaknesses: string[];
      improvements: string[];
    }
  | { ok: false; error: string };

const SYSTEM = `You analyze how likely a page is to be cited inside Google's AI Overviews (the AI-generated answers at the top of SERPs).

Citation factors that matter most:
- Direct, scannable answers in the first 200 words
- Clear factual statements with specific numbers / dates / sources
- Well-structured content (H2/H3, bullet lists, tables) for chunkability
- E-E-A-T signals: author bio, expertise indicators, citations
- FAQ sections with conversational question phrasings
- Fresh/recently updated content (Google cites fresh sources)
- Site authority + topical depth (covered separately)

Output STRICT JSON with this shape (no preamble, no fences):
{
  "verdict": "<one sentence overall>",
  "citationScore": <integer 0-100>,
  "strengths": ["<specific positive>", ...],
  "weaknesses": ["<specific weakness>", ...],
  "improvements": ["<concrete, actionable change>", ...]
}

Each list: 3-6 items max. Be specific to the page, not generic.`;

async function fetchPageContent(
  url: string,
): Promise<{ title: string | null; description: string | null; bodyText: string | null }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15_000);
    const res = await fetch(url, {
      signal: c.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
      },
    });
    clearTimeout(t);
    if (!res.ok) return { title: null, description: null, bodyText: null };
    const html = (await res.text()).slice(0, 600_000);
    const title =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
    const desc =
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      )?.[1]?.trim() ?? null;
    // Strip scripts/styles, then HTML tags, then collapse whitespace
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 8000)
      .trim();
    return { title, description: desc, bodyText };
  } catch {
    return { title: null, description: null, bodyText: null };
  }
}

export async function analyzeAiOverview(
  rawUrl: string,
): Promise<AiOverviewAnalysis> {
  if (!rawUrl?.trim()) return { ok: false, error: "URL required" };
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  const [meta, page] = await Promise.all([
    fetchSiteMetadata(url).catch(() => null),
    fetchPageContent(url),
  ]);

  if (!page.bodyText) {
    return { ok: false, error: "Couldn't fetch page content." };
  }

  const userPrompt = [
    `URL: ${url}`,
    page.title && `Title: ${page.title}`,
    page.description && `Description: ${page.description}`,
    meta?.name && `Site name: ${meta.name}`,
    "",
    "Page content (first ~8k chars):",
    page.bodyText,
    "",
    "Analyze citation-worthiness for AI Overviews. JSON only.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callAI({
    system: SYSTEM,
    user: userPrompt,
    maxTokens: 1500,
    temperature: 0.4,
    timeoutMs: 60_000,
  });

  if (!raw) {
    return {
      ok: false,
      error: "AI provider didn't respond. Check Settings → AI provider keys.",
    };
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: {
    verdict?: string;
    citationScore?: number;
    strengths?: unknown[];
    weaknesses?: unknown[];
    improvements?: unknown[];
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "Model output wasn't valid JSON." };
  }

  return {
    ok: true,
    url,
    title: page.title,
    description: page.description,
    verdict: String(parsed.verdict ?? "—"),
    citationScore: Math.max(
      0,
      Math.min(100, Number(parsed.citationScore ?? 0)),
    ),
    strengths: (parsed.strengths ?? []).map(String).slice(0, 6),
    weaknesses: (parsed.weaknesses ?? []).map(String).slice(0, 6),
    improvements: (parsed.improvements ?? []).map(String).slice(0, 6),
  };
}
