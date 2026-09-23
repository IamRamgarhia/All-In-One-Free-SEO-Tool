/**
 * AI schema-markup generator. Hand it a URL, we fetch + classify, then ask
 * the LLM to emit valid JSON-LD that matches what's actually visible on
 * the page (Article / Product / Recipe / Event / LocalBusiness / FAQ).
 *
 * Why this beats template-only generators: it picks the right type for
 * the page automatically, fills it from real data on the page, and avoids
 * faking facts that aren't there (which Google penalises).
 */

import { callAI, lastAiFailure } from "./ai-call";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type SchemaSuggestion = {
  type: string;
  jsonLd: string;
  rationale: string;
};

export type SchemaGenResult =
  | { ok: true; suggestions: SchemaSuggestion[]; pageTitle: string | null }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You are a structured-data engineer. Given the visible content of a web page, you produce valid JSON-LD schema.org markup that:
- Matches the page's actual content type (Article / NewsArticle / BlogPosting / Product / Recipe / Event / LocalBusiness / FAQPage / HowTo / VideoObject)
- Only includes fields that are demonstrably present on the page — never invent author names, prices, dates, ratings, etc.
- Uses absolute URLs
- Includes a self-canonical URL via "url" or "mainEntityOfPage"
- For dates: use ISO 8601

Output as a JSON array of 1-3 objects. Each object: { "type": "<Schema type>", "jsonLd": "<the JSON-LD as a JSON string>", "rationale": "<one short sentence why this type fits>" }.

Rules:
- Output JSON only — no commentary, no code fences.
- "jsonLd" must itself be a JSON-LD string, fully valid, including @context and @type.
- If the page is unsuitable for any rich-result schema, return [].`;

export async function generateSchemaFromUrl(opts: {
  url: string;
  clientId?: number | null;
}): Promise<SchemaGenResult> {
  const html = await fetchHtml(opts.url);
  if (!html) {
    return { ok: false, error: "Couldn't fetch the page." };
  }

  const facts = extractFacts(html);
  const userPrompt = [
    `URL: ${opts.url}`,
    `Title: ${facts.title ?? "(none)"}`,
    `Meta description: ${facts.description ?? "(none)"}`,
    `Canonical: ${facts.canonical ?? "(same as URL)"}`,
    `H1: ${facts.h1 ?? "(none)"}`,
    `H2 (first 8): ${facts.h2List.slice(0, 8).join(" | ") || "(none)"}`,
    `Visible text excerpt: ${facts.textExcerpt}`,
    `Author byline: ${facts.author ?? "(none)"}`,
    `Published date: ${facts.published ?? "(none)"}`,
    `Updated date: ${facts.updated ?? "(none)"}`,
    `OG type: ${facts.ogType ?? "(none)"}`,
    `Existing schema types: ${facts.existingSchemaTypes.join(", ") || "(none)"}`,
    "",
    `Generate up to 3 JSON-LD schema suggestions appropriate to this page. JSON array only.`,
  ].join("\n");

  const raw = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 1500,
    temperature: 0.2,
    timeoutMs: 45_000,
    feature: "general",
    clientId: opts.clientId ?? null,
  });
  if (!raw) {
    return {
      ok: false,
      error: lastAiFailure()?.message ?? "AI provider didn't respond. Set up a key in Settings → AI provider.",
    };
  }
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) {
    return { ok: false, error: "AI returned an unexpected format." };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "AI didn't return an array." };
    }
    const valid: SchemaSuggestion[] = [];
    for (const p of parsed) {
      if (!p || typeof p !== "object") continue;
      const o = p as { type?: unknown; jsonLd?: unknown; rationale?: unknown };
      if (
        typeof o.type === "string" &&
        typeof o.jsonLd === "string" &&
        typeof o.rationale === "string"
      ) {
        // Validate JSON-LD parses
        try {
          JSON.parse(o.jsonLd);
          valid.push({
            type: o.type,
            jsonLd: prettifyJsonLd(o.jsonLd),
            rationale: o.rationale,
          });
        } catch {
          // skip invalid
        }
      }
    }
    return { ok: true, suggestions: valid, pageTitle: facts.title };
  } catch {
    return { ok: false, error: "Couldn't parse AI response." };
  }
}

function prettifyJsonLd(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) return null;
    return (await res.text()).slice(0, 800_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type Facts = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  h1: string | null;
  h2List: string[];
  textExcerpt: string;
  author: string | null;
  published: string | null;
  updated: string | null;
  ogType: string | null;
  existingSchemaTypes: string[];
};

function extractFacts(html: string): Facts {
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descM = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  const canonM = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  );
  const ogTypeM = html.match(
    /<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i,
  );
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const h2List: string[] = [];
  for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const t = stripTags(m[1]).trim();
    if (t.length >= 3 && t.length <= 200) h2List.push(t);
  }

  // Strip script/style/nav/footer/aside, then collapse whitespace
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");
  const text = stripTags(cleaned).replace(/\s+/g, " ").trim();
  const textExcerpt = text.slice(0, 1500);

  const authorM = html.match(
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
  );
  const publishedM =
    html.match(
      /<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished)["'][^>]+content=["']([^"']+)["']/i,
    ) ?? html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  const updatedM =
    html.match(
      /<meta[^>]+(?:property|name)=["'](?:article:modified_time|dateModified)["'][^>]+content=["']([^"']+)["']/i,
    ) ?? html.match(/"dateModified"\s*:\s*"([^"]+)"/i);

  const existingSchemaTypes: string[] = [];
  for (const m of html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) {
    if (!existingSchemaTypes.includes(m[1])) existingSchemaTypes.push(m[1]);
  }

  return {
    title: titleM ? decodeEntities(titleM[1]).trim() : null,
    description: descM ? decodeEntities(descM[1]).trim() : null,
    canonical: canonM ? canonM[1].trim() : null,
    h1: h1M ? decodeEntities(stripTags(h1M[1])).trim() : null,
    h2List,
    textExcerpt,
    author: authorM ? decodeEntities(authorM[1]).trim() : null,
    published: publishedM?.[1] ?? null,
    updated: updatedM?.[1] ?? null,
    ogType: ogTypeM?.[1] ?? null,
    existingSchemaTypes: existingSchemaTypes.slice(0, 8),
  };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
