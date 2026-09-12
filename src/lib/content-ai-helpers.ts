/**
 * Small AI helpers grouped: content summarizer, bulk image alt-text
 * generator, News SEO headline tester, paste-from-Docs content scorer.
 */

import { callAI, lastAiFailure } from "./ai-call";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

// =============== AI summarizer ===============

const SUMMARIZE_SYSTEM = `You produce concise SEO-friendly content summaries. Return JSON only:
{
  "tldr": "<single sentence ≤30 words>",
  "keyTakeaways": ["<5-7 bullet points, each ≤18 words>"],
  "metaDescription": "<150-160 char description suitable for <meta name='description'>",
  "tweetableQuote": "<single quotable line ≤220 chars>"
}
Hard rules: only summarize what's actually in the input. Don't add facts. JSON only.`;

export type Summary = {
  tldr: string;
  keyTakeaways: string[];
  metaDescription: string;
  tweetableQuote: string;
};

export async function summarizeContent(opts: {
  text: string;
  clientId?: number | null;
}): Promise<{ ok: true; summary: Summary } | { ok: false; error: string }> {
  if (!opts.text.trim()) return { ok: false, error: "No content to summarize." };
  if (opts.text.length > 30_000) {
    return { ok: false, error: "Content too long (>30KB). Trim and retry." };
  }
  const raw = await callAI({
    system: SUMMARIZE_SYSTEM,
    user: opts.text,
    maxTokens: 600,
    temperature: 0.3,
    timeoutMs: 30_000,
    feature: "general",
    clientId: opts.clientId ?? null,
  });
  if (!raw) return { ok: false, error: lastAiFailure()?.message ?? "AI provider didn't respond." };
  return parseSummary(raw);
}

function parseSummary(
  raw: string,
): { ok: true; summary: Summary } | { ok: false; error: string } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1)
    return { ok: false, error: "AI returned an unexpected format." };
  try {
    const p = JSON.parse(cleaned.slice(start, end + 1)) as {
      tldr?: unknown;
      keyTakeaways?: unknown;
      metaDescription?: unknown;
      tweetableQuote?: unknown;
    };
    if (
      typeof p.tldr !== "string" ||
      !Array.isArray(p.keyTakeaways) ||
      typeof p.metaDescription !== "string"
    ) {
      return { ok: false, error: "AI response missing required fields." };
    }
    return {
      ok: true,
      summary: {
        tldr: p.tldr.trim(),
        keyTakeaways: (p.keyTakeaways as unknown[]).filter(
          (s): s is string => typeof s === "string",
        ),
        metaDescription: p.metaDescription.trim(),
        tweetableQuote:
          typeof p.tweetableQuote === "string" ? p.tweetableQuote.trim() : "",
      },
    };
  } catch {
    return { ok: false, error: "Couldn't parse AI response." };
  }
}

// =============== Bulk alt-text generator ===============

const ALT_SYSTEM = `You write SEO-friendly alt text for blog and ecommerce images.

Rules per alt text:
- Describe what's actually in the image, not what the page is about
- ≤120 chars, plain English
- Include the most relevant keyword from the page context naturally if it fits — don't force it
- No "image of" / "picture of" prefixes
- Lowercase first letter unless it's a proper noun

Output JSON only — array, one entry per image:
[{"src":"<src>","alt":"<alt text>"}]`;

export type AltSuggestion = { src: string; alt: string };

export async function generateBulkAlt(opts: {
  pageContext: string;
  imageDescriptions: { src: string; nearbyText?: string }[];
  clientId?: number | null;
}): Promise<{ ok: true; suggestions: AltSuggestion[] } | { ok: false; error: string }> {
  if (opts.imageDescriptions.length === 0)
    return { ok: false, error: "No images." };

  const list = opts.imageDescriptions
    .slice(0, 30)
    .map(
      (i, idx) =>
        `${idx + 1}. src: ${i.src}\n   nearby text: ${(i.nearbyText ?? "").slice(0, 200) || "(none)"}`,
    )
    .join("\n");

  const userPrompt = [
    `Page context (title + first paragraph): ${opts.pageContext.slice(0, 800)}`,
    "",
    `Images:`,
    list,
    "",
    "Generate alt text for each. JSON array only.",
  ].join("\n");

  const raw = await callAI({
    system: ALT_SYSTEM,
    user: userPrompt,
    maxTokens: 1200,
    temperature: 0.4,
    timeoutMs: 30_000,
    feature: "content_idea",
    clientId: opts.clientId ?? null,
  });
  if (!raw) return { ok: false, error: lastAiFailure()?.message ?? "AI provider didn't respond." };

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1)
    return { ok: false, error: "AI returned an unexpected format." };
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
    const out: AltSuggestion[] = [];
    for (const p of parsed) {
      if (!p || typeof p !== "object") continue;
      const o = p as { src?: unknown; alt?: unknown };
      if (typeof o.src === "string" && typeof o.alt === "string") {
        out.push({ src: o.src, alt: o.alt.trim().slice(0, 160) });
      }
    }
    if (out.length === 0)
      return { ok: false, error: "AI returned no valid alt suggestions." };
    return { ok: true, suggestions: out };
  } catch {
    return { ok: false, error: "Couldn't parse AI response." };
  }
}

/** Fetch a URL and extract every <img> with src + nearby text for alt-gen. */
export async function fetchImagesFromUrl(url: string): Promise<{
  pageContext: string;
  images: { src: string; nearbyText: string }[];
} | null> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    html = (await res.text()).slice(0, 1_500_000);
  } catch {
    return null;
  }

  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descM = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  const firstP = html.match(/<p[^>]*>([\s\S]{40,500}?)<\/p>/i);
  const pageContext = [
    titleM?.[1] ?? "",
    descM?.[1] ?? "",
    stripTags(firstP?.[1] ?? ""),
  ]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 1000);

  const images: { src: string; nearbyText: string }[] = [];
  for (const m of html.matchAll(
    /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi,
  )) {
    const src = m[1];
    if (!src) continue;
    let absolute = src;
    try {
      absolute = new URL(src, url).toString();
    } catch {
      // keep as-is
    }
    // Pull ~200 chars of context around the image position
    const idx = m.index ?? 0;
    const before = html.slice(Math.max(0, idx - 200), idx);
    const after = html.slice(idx, idx + 200);
    const nearby = stripTags(`${before} ${after}`).replace(/\s+/g, " ").trim();
    images.push({ src: absolute, nearbyText: nearby.slice(0, 200) });
    if (images.length >= 30) break;
  }
  return { pageContext, images };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

// =============== News SEO: headline tester ===============

const HEADLINE_SYSTEM = `You audit news / journalistic headlines. For the given headline + context, return JSON:
{
  "score": 0-100,
  "issues": ["<short list of issues, e.g. 'too long for Top Stories', 'missing primary keyword', 'lacks news hook'>"],
  "suggestions": ["<3-5 alternate headlines, each ≤80 chars, AP-style>"]
}
Rules: stay in news-writing tradition (front-load the news, no clickbait). JSON only.`;

export type HeadlineAudit = {
  score: number;
  issues: string[];
  suggestions: string[];
  /** Length quality flags, computed locally. */
  charCount: number;
  wordCount: number;
  topStoriesFit: boolean;
};

export async function auditNewsHeadline(opts: {
  headline: string;
  topic?: string;
  clientId?: number | null;
}): Promise<{ ok: true; audit: HeadlineAudit } | { ok: false; error: string }> {
  if (!opts.headline.trim()) return { ok: false, error: "Headline required." };
  const charCount = opts.headline.length;
  const wordCount = opts.headline.trim().split(/\s+/).length;
  const topStoriesFit = charCount >= 30 && charCount <= 110;

  const raw = await callAI({
    system: HEADLINE_SYSTEM,
    user: [
      `Headline: ${opts.headline}`,
      opts.topic ? `Topic / context: ${opts.topic}` : "",
      "",
      "Audit it. JSON only.",
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 500,
    temperature: 0.4,
    timeoutMs: 25_000,
    feature: "title_rewrite",
    clientId: opts.clientId ?? null,
  });
  if (!raw) {
    // fall back to local-only scoring
    return {
      ok: true,
      audit: {
        score: topStoriesFit ? 70 : 50,
        issues: topStoriesFit
          ? []
          : ["Length outside Google Top Stories sweet spot (30-110 chars)"],
        suggestions: [],
        charCount,
        wordCount,
        topStoriesFit,
      },
    };
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1)
    return { ok: false, error: "AI returned an unexpected format." };
  try {
    const p = JSON.parse(cleaned.slice(start, end + 1)) as {
      score?: unknown;
      issues?: unknown;
      suggestions?: unknown;
    };
    return {
      ok: true,
      audit: {
        score:
          typeof p.score === "number" ? Math.max(0, Math.min(100, p.score)) : 50,
        issues: Array.isArray(p.issues)
          ? (p.issues as unknown[]).filter((s): s is string => typeof s === "string")
          : [],
        suggestions: Array.isArray(p.suggestions)
          ? (p.suggestions as unknown[]).filter(
              (s): s is string => typeof s === "string",
            )
          : [],
        charCount,
        wordCount,
        topStoriesFit,
      },
    };
  } catch {
    return { ok: false, error: "Couldn't parse AI response." };
  }
}

// =============== Auto-link suggester ===============

const AUTOLINK_SYSTEM = `You're an internal-linking editor. Given a piece of content and a list of internal pages on the same site, propose links to add. For each link, pick a span of text in the content that should become an anchor + which page it should link to.

Rules:
- Don't propose links the content already has
- Don't link the same page twice in close proximity
- Pick descriptive anchor text — never "click here"
- Each anchor should be a span that appears verbatim in the content
- Up to 6 suggestions — quality over quantity

Output JSON only — array:
[{"anchor":"<exact text from content>","targetUrl":"<URL from list>","reason":"<one short sentence>"}]`;

export type AutoLinkSuggestion = {
  anchor: string;
  targetUrl: string;
  reason: string;
};

export async function suggestAutoLinks(opts: {
  content: string;
  internalPages: { url: string; title: string }[];
  clientId?: number | null;
}): Promise<
  { ok: true; suggestions: AutoLinkSuggestion[] } | { ok: false; error: string }
> {
  if (!opts.content.trim()) return { ok: false, error: "Content required." };
  if (opts.internalPages.length === 0)
    return { ok: false, error: "No internal pages provided." };

  const pageList = opts.internalPages
    .slice(0, 60)
    .map((p) => `- ${p.url} — ${p.title}`)
    .join("\n");

  const userPrompt = [
    `Content:`,
    opts.content.slice(0, 8000),
    "",
    `Internal pages on this site:`,
    pageList,
    "",
    "Propose internal links. JSON array only.",
  ].join("\n");

  const raw = await callAI({
    system: AUTOLINK_SYSTEM,
    user: userPrompt,
    maxTokens: 800,
    temperature: 0.3,
    timeoutMs: 30_000,
    feature: "general",
    clientId: opts.clientId ?? null,
  });
  if (!raw) return { ok: false, error: lastAiFailure()?.message ?? "AI provider didn't respond." };

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1)
    return { ok: false, error: "AI returned an unexpected format." };
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
    const out: AutoLinkSuggestion[] = [];
    for (const p of parsed) {
      if (!p || typeof p !== "object") continue;
      const o = p as { anchor?: unknown; targetUrl?: unknown; reason?: unknown };
      if (
        typeof o.anchor === "string" &&
        typeof o.targetUrl === "string" &&
        typeof o.reason === "string"
      ) {
        // Verify anchor actually appears in content
        if (opts.content.toLowerCase().includes(o.anchor.toLowerCase().trim())) {
          out.push({
            anchor: o.anchor.trim(),
            targetUrl: o.targetUrl.trim(),
            reason: o.reason.trim(),
          });
        }
      }
    }
    return { ok: true, suggestions: out };
  } catch {
    return { ok: false, error: "Couldn't parse AI response." };
  }
}
