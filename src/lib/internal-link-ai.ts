/**
 * AI internal-link recommender. Given a draft + a client, find the
 * client's existing pages that are most semantically relevant and ask
 * the LLM to propose specific anchor texts + the exact paragraph in the
 * draft where each link should go.
 *
 * Pipeline:
 *   1. Use the existing internal-link-graph crawler to get the client's
 *      pages (capped at 100 — we already cache crawls per session).
 *   2. Compute TF-IDF cosine similarity between the draft and each page.
 *   3. Pick the top 8-12 most-relevant pages.
 *   4. Send the draft + candidates to the LLM with a tight schema prompt.
 *   5. LLM returns 3-5 link suggestions with anchor text + which existing
 *      page to link to + a 60-character snippet of the draft showing
 *      where it fits.
 *
 * Free — uses the existing crawler + the configured AI provider (any of
 * Gemini/Groq/OpenRouter free tier / Ollama / BYO).
 */

import { analyseInternalLinks } from "./internal-link-graph";
import { callAI, lastAiFailure } from "./ai-call";

export type LinkSuggestion = {
  anchorText: string;
  /** URL on the client's own site to link to. */
  targetUrl: string;
  /** ~60-char snippet of the user's draft where this anchor fits. */
  contextSnippet: string;
  /** Why the LLM picked this pairing. */
  rationale: string;
};

export type InternalLinkAiResult = {
  suggestions: LinkSuggestion[];
  candidateCount: number;
  error?: string;
};

const SYSTEM_PROMPT = `You are an SEO editor. The user just wrote a draft and you have access to their existing site's pages. Suggest specific internal-link insertions that would (a) help the reader, (b) pass authority to the linked page, and (c) make sense at the place you propose inserting them.

Output STRICT JSON with this shape:
{"suggestions": [
  {"anchorText": "...", "targetUrl": "...", "contextSnippet": "...60 chars from the draft showing the position...", "rationale": "..."}
]}

Rules:
- 3-5 suggestions max. Quality over quantity.
- anchorText: 2-6 words, natural-sounding, descriptive of the destination
- targetUrl: must be exactly one of the candidate URLs given to you
- contextSnippet: 30-80 chars from the user's draft showing where to insert
- rationale: ≤25 words on why this link helps
- Do NOT invent URLs. If no candidate fits, return an empty suggestions array.
- Do NOT propose linking to the same URL twice.

Output ONLY the JSON. No commentary.`;

export async function suggestInternalLinks(opts: {
  clientId?: number;
  /** Site origin to crawl for candidate pages. */
  siteUrl: string;
  /** Plain-text or markdown draft. */
  draft: string;
  /** Skip the URL the user is currently writing for (avoid self-link). */
  excludeUrl?: string;
}): Promise<InternalLinkAiResult> {
  if (!opts.draft.trim() || opts.draft.length < 100) {
    return {
      suggestions: [],
      candidateCount: 0,
      error: "Draft too short — need at least ~100 characters.",
    };
  }

  // Crawl the site to enumerate candidate URLs + their text
  const analysis = await analyseInternalLinks({
    startUrl: opts.siteUrl,
    maxPages: 100,
  });

  if (analysis.pages.length === 0) {
    return {
      suggestions: [],
      candidateCount: 0,
      error: "Couldn't crawl the site — pages list is empty.",
    };
  }

  // Compute relevance vs the draft using a small TF-IDF over the
  // candidate corpus + the draft. Take top 10.
  const draftTokens = tokenize(opts.draft);
  if (draftTokens.size === 0) {
    return {
      suggestions: [],
      candidateCount: 0,
      error: "Draft has no usable terms after stop-word filtering.",
    };
  }

  const candidates = analysis.pages
    .filter((p) => p.url !== opts.excludeUrl)
    .filter((p) => p.title && p.wordCount > 50)
    .slice(0, 80)
    .map((p) => ({
      url: p.url,
      title: p.title,
      // Score = simple Jaccard-like overlap of significant tokens
      score: scoreOverlap(draftTokens, tokenize(p.title)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (candidates.length === 0) {
    return {
      suggestions: [],
      candidateCount: 0,
      error: "No relevant existing pages found on the site.",
    };
  }

  const userPrompt = [
    "User's draft (truncated to first 3000 chars):",
    opts.draft.slice(0, 3000),
    "",
    "Candidate pages on the same site (URL + title):",
    ...candidates.map((c) => `  ${c.url}  ::  ${c.title}`),
    "",
    "Now propose 3-5 internal-link insertions in the JSON format described.",
  ].join("\n");

  const raw = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 800,
    temperature: 0.3,
    timeoutMs: 35_000,
    feature: "content_idea",
    clientId: opts.clientId ?? null,
    ignoreCreditSaver: true,
  });
  if (!raw) {
    return {
      suggestions: [],
      candidateCount: candidates.length,
      error: lastAiFailure()?.message ?? "AI provider didn't respond. Configure one in Settings → API keys.",
    };
  }

  let parsed: { suggestions?: LinkSuggestion[] };
  try {
    parsed = JSON.parse(extractJsonObject(raw));
  } catch {
    return {
      suggestions: [],
      candidateCount: candidates.length,
      error: "AI returned malformed JSON.",
    };
  }

  const validUrls = new Set(candidates.map((c) => c.url));
  const cleaned = (parsed.suggestions ?? []).filter(
    (s): s is LinkSuggestion =>
      Boolean(s) &&
      typeof s.anchorText === "string" &&
      s.anchorText.length >= 2 &&
      s.anchorText.length <= 80 &&
      typeof s.targetUrl === "string" &&
      validUrls.has(s.targetUrl) &&
      typeof s.contextSnippet === "string" &&
      s.contextSnippet.length >= 10,
  );

  // Dedupe by targetUrl
  const seen = new Set<string>();
  const deduped = cleaned.filter((s) => {
    if (seen.has(s.targetUrl)) return false;
    seen.add(s.targetUrl);
    return true;
  });

  return {
    suggestions: deduped.slice(0, 5),
    candidateCount: candidates.length,
  };
}

const STOP = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been",
  "have","has","had","do","does","did","will","would","could","should",
  "may","might","must","shall","of","in","on","at","to","for","with",
  "by","from","into","over","under","up","down","out","off","about",
  "this","that","these","those","i","me","my","you","your","we","us",
  "our","they","them","their","it","its","he","him","his","she","her",
  "as","if","than","then","when","where","while","because","so","also",
  "just","only","very","more","most","some","any","each","every","other",
  "such","no","not","yes","can","like","get","got","make","made",
]);

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && w.length <= 24 && !STOP.has(w));
  return new Set(tokens);
}

function scoreOverlap(a: Set<string>, b: Set<string>): number {
  if (b.size === 0) return 0;
  let inter = 0;
  for (const t of b) if (a.has(t)) inter++;
  // weight by candidate brevity so a 4-word page-title sharing 2 tokens
  // beats a 30-word title sharing 3
  return inter / Math.sqrt(b.size);
}

function extractJsonObject(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return "{}";
}
