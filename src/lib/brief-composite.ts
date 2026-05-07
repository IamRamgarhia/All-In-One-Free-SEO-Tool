/**
 * Composite content brief — combines our existing buildCorpus + serp-scanner
 * with AI to produce a writer-ready markdown brief in one shot.
 *
 * Distinct from the older lib/content-brief.ts (which generates a thinner,
 * outline-only brief). This is the full briefing document a content team
 * actually needs.
 */

import { callAI } from "./ai-call";
import { buildCorpus } from "./content-grader";
import { scanSerp } from "./serp-scanner";

export type CompositeBrief = {
  ok: boolean;
  query: string;
  country: string;
  intent: string;
  targetWordCount: { min: number; ideal: number; max: number };
  recurringHeadings: string[];
  topTerms: string[];
  paaQuestions: string[];
  relatedSearches: string[];
  /** Markdown brief written by the AI. */
  brief: string;
  serpUrls: string[];
  error?: string;
};

const SYSTEM_PROMPT = `You are a senior SEO content strategist. Write a writer-ready content brief in markdown given the SERP intelligence below.

Sections required (in order, with these exact headings):

# {Suggested working title (under 70 chars)}

## Search intent
One short paragraph: what the searcher wants, dominant SERP format (listicle / how-to / comparison / definition / case study), commercial-vs-informational classification.

## Target reader
One paragraph — who they are, what they already know, what they don't.

## Length target
Specific word count range with rationale tied to SERP medians.

## Suggested H2/H3 outline
8-15 H2s with H3s. Sequenced logically (discovery → comparison → decision). Don't regurgitate recurring headings — merge, add, reorder so the article actually flows. Tag each section "(must)" or "(nice-to-have)".

## Semantic terms to cover
Bulleted list of plain-English terms (no "TF-IDF rank") drawn from the topTerms list.

## FAQ block (5-7 questions)
From PAA. For each, a 40-60 word answer angle to win the snippet.

## Internal-link anchor opportunities
3-5 anchor-text suggestions. Mark them "[anchor]".

## Featured snippet shape
One section formatted to win the paragraph snippet (40-60 words right after the H2).

## CTA / conversion hook
One sentence on what action the reader should take.

Rules:
- Concrete, specific. The writer should not need to make any creative decisions
- Don't invent facts or stats. Reference what the SERP shows
- 600-1000 words total
- Markdown only — no preamble, no explanation`;

export async function generateCompositeBrief(opts: {
  query: string;
  country?: string;
  clientDomain?: string;
  clientId?: number | null;
}): Promise<CompositeBrief> {
  const country = (opts.country ?? "US").toUpperCase();

  const [insights, serp] = await Promise.all([
    buildCorpus({ targetKeyword: opts.query, country }),
    scanSerp({ query: opts.query, country, clientDomain: opts.clientDomain }),
  ]);

  if (insights.corpusSize === 0) {
    return empty(
      opts.query,
      country,
      insights.error ?? "Couldn't build SERP corpus",
    );
  }

  const intent = inferIntent(opts.query, serp.topResults.map((r) => r.title));
  const median = insights.medianWordCount;
  const targetWordCount = {
    min: Math.max(400, Math.round(median * 0.85)),
    ideal: Math.round(median * 1.05),
    max: Math.round(median * 1.3),
  };

  const userPrompt = [
    `Query: ${opts.query}`,
    `Country: ${country}`,
    `Inferred intent: ${intent}`,
    `SERP median word count: ${median}`,
    `Target word-count range: ${targetWordCount.min}-${targetWordCount.max} (ideal ~${targetWordCount.ideal})`,
    "",
    `Top organic results:`,
    ...serp.topResults
      .slice(0, 10)
      .map((r, i) => `  ${i + 1}. ${r.title} — ${r.domain}`),
    "",
    `Recurring SERP headings (used by 2+ top results):`,
    ...insights.recurringHeadings.slice(0, 15).map((h) => `  - ${h.heading}`),
    "",
    `Top terms by TF-IDF:`,
    ...insights.topTerms.slice(0, 25).map((t) => `  - ${t.term}`),
    "",
    `People Also Ask:`,
    ...serp.paaQuestions.slice(0, 8).map((q) => `  - ${q}`),
    "",
    `Related searches:`,
    ...serp.relatedSearches.slice(0, 8).map((s) => `  - ${s}`),
    "",
    `Now write the brief.`,
  ].join("\n");

  const brief = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 2200,
    temperature: 0.4,
    timeoutMs: 60_000,
    feature: "content_idea",
    clientId: opts.clientId ?? null,
    ignoreCreditSaver: true,
  });

  return {
    ok: true,
    query: opts.query,
    country,
    intent,
    targetWordCount,
    recurringHeadings: insights.recurringHeadings.slice(0, 15).map((h) => h.heading),
    topTerms: insights.topTerms.slice(0, 25).map((t) => t.term),
    paaQuestions: serp.paaQuestions.slice(0, 8),
    relatedSearches: serp.relatedSearches.slice(0, 8),
    brief: brief ?? "",
    serpUrls: serp.topResults.slice(0, 10).map((r) => r.url),
  };
}

function inferIntent(query: string, titles: string[]): string {
  const q = query.toLowerCase();
  const titleBlob = titles.join(" ").toLowerCase();
  if (/\b(buy|order|price|pricing|cheap|deal|coupon)\b/.test(q))
    return "transactional";
  if (/\b(best|top \d|review|vs|compare|alternative)\b/.test(q))
    return "commercial";
  if (/\b(near me|in [a-z]+|nearby)\b/.test(q)) return "local";
  if (/\b(how|what|why|guide|tutorial|tips|examples|meaning)\b/.test(q))
    return "informational";
  if (/\b(login|sign in|dashboard|app|youtube|reddit|wikipedia)\b/.test(q))
    return "navigational";
  if (/\b(best|review|vs|compare|alternative)\b/.test(titleBlob))
    return "commercial";
  if (/\b(how|guide|tutorial)\b/.test(titleBlob)) return "informational";
  return "informational";
}

function empty(query: string, country: string, error: string): CompositeBrief {
  return {
    ok: false,
    query,
    country,
    intent: "unknown",
    targetWordCount: { min: 0, ideal: 0, max: 0 },
    recurringHeadings: [],
    topTerms: [],
    paaQuestions: [],
    relatedSearches: [],
    brief: "",
    serpUrls: [],
    error,
  };
}
