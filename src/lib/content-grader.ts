/**
 * Content grader — Surfer / Clearscope replacement.
 *
 * Pulls the top-10 organic SERP results for a target keyword + country,
 * fetches each result's HTML, extracts the main body text, then computes:
 *
 *   - Median word count across the corpus → suggested length
 *   - Top 60 terms by TF-IDF across the corpus (with stop-word filter
 *     and target-keyword expansion) → "term coverage" the user should hit
 *   - Average target-keyword density in the corpus → density target
 *   - List of headings appearing across multiple SERP results → outline
 *     suggestions
 *
 * Scores the user's draft against the corpus:
 *   - Length: 0-30 points (smooth penalty if <80% or >150% of median)
 *   - Term coverage: 0-50 points (% of top-60 terms covered, weighted)
 *   - Density: 0-20 points (in the 0.5%-1.5% sweet spot = full marks)
 *
 * Free — uses our existing browser-mode SERP scanner + plain HTTP fetch.
 * No paid APIs, no embedding model, no third-party NLP service.
 */

import { scanSerp } from "./serp-scanner";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

// Generic English stop-words. Languages we don't tokenize specially still
// work (we just don't filter), with reduced score precision.
const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","been","but","by","do","does",
  "for","from","had","has","have","he","her","his","i","if","in","is",
  "it","its","may","me","might","more","most","my","no","not","of","on",
  "or","our","ours","over","she","so","some","such","than","that","the",
  "their","them","then","there","these","they","this","to","under","up",
  "very","was","we","were","what","when","where","which","while","who",
  "why","will","with","would","you","your","yours","also","just","like",
  "into","about","after","before","because","both","each","few","other",
  "own","same","should","through","you'll","you're","you've","i'm","it's",
  "don't","doesn't","didn't","can't","won't","wouldn't","shouldn't","-",
  "—","–","also","www","com","https","http","html","-",
]);

export type CorpusInsights = {
  /** Number of SERP results we successfully fetched + parsed. */
  corpusSize: number;
  /** Median word count across the corpus. */
  medianWordCount: number;
  /** Per-result word counts so the UI can render a distribution chart. */
  wordCounts: number[];
  /** Average target-keyword density (× 100, so 1 == 1%). */
  avgKeywordDensityPct: number;
  /** Top terms (TF-IDF ranked) with their corpus frequency. */
  topTerms: { term: string; corpusFreq: number; weight: number }[];
  /** Headings that appear across multiple SERP results (h2/h3 candidates). */
  recurringHeadings: { heading: string; count: number }[];
  /** Sample of SERP URLs we scored against. */
  sources: { url: string; title: string; wordCount: number }[];
  error?: string;
};

export type GradeResult = {
  /** 0-100 overall score. */
  score: number;
  /** Breakdown so the user knows where they're losing points. */
  breakdown: {
    lengthScore: number; // 0-30
    coverageScore: number; // 0-50
    densityScore: number; // 0-20
  };
  /** Plain-language recommendations. */
  recommendations: string[];
  /** Terms the user is missing vs the SERP corpus. */
  missingTerms: string[];
  /** Terms the user has but the SERP corpus uses heavily — confirms relevance. */
  presentTerms: string[];
  /** Length feedback. */
  wordCount: number;
  targetWordCount: { min: number; ideal: number; max: number };
  /** Density feedback. */
  keywordDensityPct: number;
  targetDensity: { min: number; ideal: number; max: number };
};

/**
 * Build the corpus by scraping the top-10 SERP results for the keyword.
 */
export async function buildCorpus(opts: {
  targetKeyword: string;
  country?: string;
  language?: string;
  /** Max results to use as the corpus (default 10). */
  limit?: number;
}): Promise<CorpusInsights> {
  const limit = opts.limit ?? 10;

  const serp = await scanSerp({
    query: opts.targetKeyword,
    country: opts.country ?? "US",
  });
  if (!serp.ok || serp.topResults.length === 0) {
    return emptyInsights(serp.error ?? "Couldn't fetch SERP for this keyword.");
  }

  const urls = serp.topResults
    .filter((r) => r.url && /^https?:\/\//i.test(r.url))
    .slice(0, limit);

  // Fetch + parse each result, capped at 6 in flight.
  const fetched: ParsedDoc[] = [];
  for (let i = 0; i < urls.length; i += 6) {
    const batch = urls.slice(i, i + 6);
    const results = await Promise.allSettled(
      batch.map((r) =>
        fetchAndParse(r.url, r.title || "", opts.targetKeyword),
      ),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) fetched.push(r.value);
    }
  }

  if (fetched.length === 0) {
    return emptyInsights("Couldn't fetch any SERP result content.");
  }

  return computeInsights(fetched, opts.targetKeyword);
}

/**
 * Score a piece of user-written content against the SERP corpus.
 */
export function gradeAgainstCorpus(opts: {
  content: string;
  targetKeyword: string;
  insights: CorpusInsights;
}): GradeResult {
  const userTokens = tokenize(opts.content);
  const userWordCount = userTokens.length;
  const userTermSet = new Set(userTokens);
  const target = opts.targetKeyword.toLowerCase();

  const targetWordCount = {
    min: Math.round(opts.insights.medianWordCount * 0.7),
    ideal: opts.insights.medianWordCount,
    max: Math.round(opts.insights.medianWordCount * 1.5),
  };
  const targetDensity = { min: 0.5, ideal: 1.0, max: 1.5 };

  // Length score (0-30): smooth, peaks at ideal ± 25%
  const lengthRatio = userWordCount / Math.max(1, targetWordCount.ideal);
  let lengthScore = 0;
  if (lengthRatio >= 0.8 && lengthRatio <= 1.25) lengthScore = 30;
  else if (lengthRatio >= 0.6 && lengthRatio <= 1.5) lengthScore = 22;
  else if (lengthRatio >= 0.4 && lengthRatio <= 2.0) lengthScore = 14;
  else lengthScore = 6;

  // Coverage score (0-50): weighted by term importance (top 60)
  const totalWeight = opts.insights.topTerms
    .slice(0, 60)
    .reduce((s, t) => s + t.weight, 0);
  let hitWeight = 0;
  const presentTerms: string[] = [];
  const missingTerms: string[] = [];
  for (const t of opts.insights.topTerms.slice(0, 60)) {
    if (userTermSet.has(t.term)) {
      hitWeight += t.weight;
      presentTerms.push(t.term);
    } else {
      missingTerms.push(t.term);
    }
  }
  const coverageScore =
    totalWeight > 0 ? Math.round((hitWeight / totalWeight) * 50) : 0;

  // Density score (0-20): exact-match keyword density
  const keywordOccurrences = countKeywordHits(opts.content, target);
  const keywordDensityPct =
    userWordCount > 0 ? (keywordOccurrences / userWordCount) * 100 : 0;
  let densityScore = 0;
  if (keywordDensityPct >= targetDensity.min && keywordDensityPct <= targetDensity.max)
    densityScore = 20;
  else if (keywordDensityPct >= 0.3 && keywordDensityPct <= 2.5) densityScore = 12;
  else if (keywordDensityPct >= 0.15 && keywordDensityPct <= 3.5) densityScore = 6;
  else densityScore = 0;

  const score = lengthScore + coverageScore + densityScore;

  const recommendations: string[] = [];
  if (userWordCount < targetWordCount.min) {
    recommendations.push(
      `Add roughly ${targetWordCount.ideal - userWordCount} more words. Top SERP results average ${targetWordCount.ideal}.`,
    );
  } else if (userWordCount > targetWordCount.max) {
    recommendations.push(
      `Trim ~${userWordCount - targetWordCount.ideal} words. Long-form is fine but you're well past the SERP average.`,
    );
  }
  if (keywordDensityPct < targetDensity.min) {
    recommendations.push(
      `Use "${opts.targetKeyword}" more often — currently ${keywordDensityPct.toFixed(2)}%, target ~${targetDensity.ideal}%.`,
    );
  } else if (keywordDensityPct > targetDensity.max) {
    recommendations.push(
      `Reduce "${opts.targetKeyword}" usage — ${keywordDensityPct.toFixed(2)}% reads as keyword-stuffed.`,
    );
  }
  if (missingTerms.length > 0) {
    recommendations.push(
      `Cover these terms used by the top-ranking pages: ${missingTerms.slice(0, 8).join(", ")}.`,
    );
  }
  if (
    opts.insights.recurringHeadings.length > 0 &&
    !opts.insights.recurringHeadings.some((h) =>
      opts.content.toLowerCase().includes(h.heading.toLowerCase()),
    )
  ) {
    recommendations.push(
      `Consider section headings around: ${opts.insights.recurringHeadings.slice(0, 3).map((h) => `"${h.heading}"`).join(", ")}.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Length, density, and coverage are all on target. Focus on quality, examples, and original perspective.",
    );
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    breakdown: { lengthScore, coverageScore, densityScore },
    recommendations,
    missingTerms,
    presentTerms,
    wordCount: userWordCount,
    targetWordCount,
    keywordDensityPct,
    targetDensity,
  };
}

// =========================================================================
// Internal helpers
// =========================================================================

type ParsedDoc = {
  url: string;
  title: string;
  text: string;
  headings: string[];
  wordCount: number;
  keywordOccurrences: number;
};

async function fetchAndParse(
  url: string,
  fallbackTitle: string,
  targetKeyword: string,
): Promise<ParsedDoc | null> {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("text/html")) return null;
    const html = (await res.text()).slice(0, 800_000);

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = decode(titleMatch?.[1] ?? fallbackTitle).trim();

    // Extract main body text — strip nav, footer, header, scripts, styles
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1] : html;
    const cleaned = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
      .replace(/<form[\s\S]*?<\/form>/gi, " ");

    const headings: string[] = [];
    for (const m of cleaned.matchAll(/<h[2-3][^>]*>([\s\S]*?)<\/h[2-3]>/gi)) {
      const txt = decode(m[1].replace(/<[^>]+>/g, " ")).trim();
      if (txt && txt.length >= 3 && txt.length <= 120) headings.push(txt);
    }

    const text = decode(cleaned.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    const tokens = tokenize(text);

    return {
      url,
      title,
      text,
      headings,
      wordCount: tokens.length,
      keywordOccurrences: countKeywordHits(text, targetKeyword.toLowerCase()),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\-\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 28 && !STOP_WORDS.has(w));
}

function countKeywordHits(text: string, target: string): number {
  if (!target) return 0;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.toLowerCase().match(new RegExp(escaped, "g"));
  return matches ? matches.length : 0;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function computeInsights(
  docs: ParsedDoc[],
  targetKeyword: string,
): CorpusInsights {
  const wordCounts = docs.map((d) => d.wordCount).sort((a, b) => a - b);
  const medianWordCount =
    wordCounts.length === 0
      ? 0
      : wordCounts[Math.floor(wordCounts.length / 2)];

  // TF-IDF: term frequency in each doc / log(N / df)
  const totalDocs = docs.length;
  const termInDoc = new Map<string, Set<number>>(); // term → set of doc idx
  const termTotalCount = new Map<string, number>();
  const docTermCounts: Map<string, number>[] = [];
  for (let i = 0; i < docs.length; i++) {
    const tokens = tokenize(docs[i].text);
    const counts = new Map<string, number>();
    for (const t of tokens) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
      termTotalCount.set(t, (termTotalCount.get(t) ?? 0) + 1);
    }
    docTermCounts.push(counts);
    for (const t of counts.keys()) {
      const set = termInDoc.get(t) ?? new Set<number>();
      set.add(i);
      termInDoc.set(t, set);
    }
  }

  // Keep terms that appear in at least 2 of the top results (signal, not noise)
  const candidates: { term: string; weight: number; corpusFreq: number }[] = [];
  for (const [term, docSet] of termInDoc) {
    if (docSet.size < Math.min(2, totalDocs)) continue;
    if (term === targetKeyword.toLowerCase()) continue;
    const tf = termTotalCount.get(term) ?? 0;
    const idf = Math.log(totalDocs / docSet.size) + 1;
    candidates.push({ term, weight: tf * idf, corpusFreq: tf });
  }
  candidates.sort((a, b) => b.weight - a.weight);
  const topTerms = candidates.slice(0, 60);

  // Recurring headings: count how many docs feature each (lowercased + trimmed)
  const headingCount = new Map<string, number>();
  for (const d of docs) {
    const seen = new Set<string>();
    for (const h of d.headings) {
      const norm = h.toLowerCase().trim();
      if (seen.has(norm)) continue;
      seen.add(norm);
      headingCount.set(norm, (headingCount.get(norm) ?? 0) + 1);
    }
  }
  const recurringHeadings = Array.from(headingCount.entries())
    .filter(([, c]) => c >= 2)
    .map(([heading, count]) => ({ heading, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const avgKeywordDensityPct =
    docs.length > 0
      ? docs.reduce(
          (sum, d) =>
            sum +
            (d.wordCount > 0 ? (d.keywordOccurrences / d.wordCount) * 100 : 0),
          0,
        ) / docs.length
      : 0;

  return {
    corpusSize: docs.length,
    medianWordCount,
    wordCounts,
    avgKeywordDensityPct,
    topTerms,
    recurringHeadings,
    sources: docs.map((d) => ({
      url: d.url,
      title: d.title,
      wordCount: d.wordCount,
    })),
  };
}

function emptyInsights(error: string): CorpusInsights {
  return {
    corpusSize: 0,
    medianWordCount: 0,
    wordCounts: [],
    avgKeywordDensityPct: 0,
    topTerms: [],
    recurringHeadings: [],
    sources: [],
    error,
  };
}
