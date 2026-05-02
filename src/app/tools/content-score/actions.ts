"use server";

import { callAI } from "@/lib/ai-call";

export type ContentScoreResult =
  | {
      ok: true;
      score: number; // 0-100
      verdict: string;
      stats: ContentStats;
      strengths: string[];
      weaknesses: string[];
      suggestedTerms: { term: string; rationale: string }[];
      aiInsights: string[];
    }
  | { ok: false; error: string };

export type ContentStats = {
  wordCount: number;
  sentenceCount: number;
  averageWordsPerSentence: number;
  readingTimeMin: number;
  fleschScore: number;
  fleschGrade: string;
  primaryDensityPct: number;
  primaryCount: number;
  shortSentencePct: number;
  passiveVoicePct: number;
};

const SYSTEM = `You are an SEO content scoring engine. Given a piece of content + its target keyword, you assess how well-optimized it is for search and human readers.

Output STRICT JSON (no preamble, no markdown fences):
{
  "verdict": "<one sentence overall>",
  "strengths": ["<specific strength>", ...],
  "weaknesses": ["<specific weakness>", ...],
  "suggestedTerms": [{"term": "<exact phrase>", "rationale": "<short why>"}, ...],
  "aiInsights": ["<E-E-A-T / topical depth / citation observation>", ...]
}

Quality bar:
- Be SPECIFIC. "Improve readability" is bad. "Break the 65-word paragraph in section 2 into two short paragraphs" is good.
- suggestedTerms = real LSI / semantically-related terms a top-ranking page would naturally include for this keyword. 5-10 max.
- weaknesses must be ACTIONABLE — name a section, sentence, or fix.
- 3-6 items per list.

Strict avoid:
- "delve", "tapestry", "in conclusion", "in today's fast-paced world"
- Generic platitudes ("write for users", "use keywords naturally")
- Suggestions the writer can't act on without rewriting from scratch`;

export async function scoreContent(opts: {
  content: string;
  targetKeyword: string;
}): Promise<ContentScoreResult> {
  const content = opts.content?.trim() ?? "";
  const keyword = opts.targetKeyword?.trim() ?? "";
  if (!content) return { ok: false, error: "Paste some content first" };
  if (!keyword) return { ok: false, error: "Target keyword required" };

  const stats = analyzeStats(content, keyword);

  const userPrompt = [
    `Target keyword: "${keyword}"`,
    "",
    "Stats (precomputed, don't recalculate):",
    `- Word count: ${stats.wordCount}`,
    `- Sentence count: ${stats.sentenceCount}`,
    `- Avg words/sentence: ${stats.averageWordsPerSentence.toFixed(1)}`,
    `- Reading time: ${stats.readingTimeMin} min`,
    `- Flesch reading ease: ${stats.fleschScore.toFixed(0)} (${stats.fleschGrade})`,
    `- Primary keyword density: ${stats.primaryDensityPct.toFixed(2)}% (${stats.primaryCount} occurrences)`,
    `- Short sentences (≤10 words): ${stats.shortSentencePct.toFixed(0)}%`,
    `- Passive voice estimate: ${stats.passiveVoicePct.toFixed(0)}%`,
    "",
    "Content:",
    content.slice(0, 12000),
    "",
    "Score and analyze. JSON only.",
  ].join("\n");

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
      error: "AI provider didn't respond. Set up an API key in Settings.",
    };
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: {
    verdict?: string;
    strengths?: unknown[];
    weaknesses?: unknown[];
    suggestedTerms?: unknown[];
    aiInsights?: unknown[];
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "Model output wasn't valid JSON." };
  }

  const score = computeScore(stats, parsed);

  return {
    ok: true,
    score,
    verdict: String(parsed.verdict ?? "—"),
    stats,
    strengths: (parsed.strengths ?? []).map(String).slice(0, 6),
    weaknesses: (parsed.weaknesses ?? []).map(String).slice(0, 6),
    suggestedTerms: ((parsed.suggestedTerms ?? []) as Array<{
      term?: unknown;
      rationale?: unknown;
    }>)
      .map((s) => ({
        term: String(s?.term ?? ""),
        rationale: String(s?.rationale ?? ""),
      }))
      .filter((s) => s.term)
      .slice(0, 10),
    aiInsights: (parsed.aiInsights ?? []).map(String).slice(0, 6),
  };
}

function analyzeStats(content: string, keyword: string): ContentStats {
  // Strip HTML tags + collapse whitespace
  const plain = content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = plain.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = plain.split(/[.!?]+\s+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length || 1;
  const averageWordsPerSentence = wordCount / sentenceCount;
  const readingTimeMin = Math.max(1, Math.round(wordCount / 220));

  // Flesch reading ease
  // 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  const totalSyllables = words.reduce((s, w) => s + estimateSyllables(w), 0);
  const flesch =
    206.835 -
    1.015 * (wordCount / sentenceCount) -
    84.6 * (totalSyllables / Math.max(1, wordCount));
  const fleschScore = Math.max(0, Math.min(100, flesch));
  const fleschGrade =
    fleschScore >= 90
      ? "Very easy (5th grade)"
      : fleschScore >= 80
        ? "Easy (6th grade)"
        : fleschScore >= 70
          ? "Fairly easy (7th grade)"
          : fleschScore >= 60
            ? "Standard (8-9th grade)"
            : fleschScore >= 50
              ? "Fairly difficult (10-12th)"
              : fleschScore >= 30
                ? "Difficult (college)"
                : "Very difficult (graduate)";

  // Primary keyword count + density
  const lowerPlain = plain.toLowerCase();
  const lowerKw = keyword.toLowerCase();
  let primaryCount = 0;
  if (lowerKw.length > 0) {
    let idx = 0;
    while ((idx = lowerPlain.indexOf(lowerKw, idx)) !== -1) {
      primaryCount += 1;
      idx += lowerKw.length;
    }
  }
  const primaryDensityPct =
    wordCount > 0 ? (primaryCount * lowerKw.split(/\s+/).length) / wordCount * 100 : 0;

  // Short-sentence percentage
  const shortSentences = sentences.filter(
    (s) => s.split(/\s+/).filter(Boolean).length <= 10,
  ).length;
  const shortSentencePct = (shortSentences / sentenceCount) * 100;

  // Passive voice estimate (heuristic — counts "was/were/been [past participle]")
  const passiveMatches =
    plain.match(/\b(?:was|were|been|being|is|are)\s+\w+(?:ed|en)\b/gi) ?? [];
  const passivePct = (passiveMatches.length / sentenceCount) * 100;

  return {
    wordCount,
    sentenceCount,
    averageWordsPerSentence,
    readingTimeMin,
    fleschScore,
    fleschGrade,
    primaryDensityPct,
    primaryCount,
    shortSentencePct,
    passiveVoicePct: passivePct,
  };
}

function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  // Drop trailing silent e
  const cleaned = w.replace(/e$/, "");
  const groups = cleaned.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

function computeScore(
  stats: ContentStats,
  parsed: { weaknesses?: unknown[]; suggestedTerms?: unknown[] },
): number {
  let score = 100;

  // Word count
  if (stats.wordCount < 300) score -= 25;
  else if (stats.wordCount < 600) score -= 10;
  else if (stats.wordCount < 800) score -= 5;
  else if (stats.wordCount > 3500) score -= 5;

  // Reading ease
  if (stats.fleschScore < 30) score -= 12;
  else if (stats.fleschScore < 50) score -= 6;

  // Avg sentence length
  if (stats.averageWordsPerSentence > 25) score -= 8;
  else if (stats.averageWordsPerSentence > 20) score -= 4;

  // Keyword density
  if (stats.primaryCount === 0) score -= 25;
  else if (stats.primaryDensityPct > 3) score -= 15; // stuffed
  else if (stats.primaryDensityPct < 0.3 && stats.wordCount >= 600) score -= 8;

  // Short sentences
  if (stats.shortSentencePct < 15) score -= 5; // monotonous

  // Passive voice
  if (stats.passiveVoicePct > 30) score -= 6;

  // AI weaknesses each cost a few points
  const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses.length : 0;
  score -= Math.min(15, weaknesses * 3);

  // Bonus for using suggested terms gracefully — handled by AI, just clamp here
  return Math.max(0, Math.min(100, Math.round(score)));
}

import { saveSnapshot } from "@/lib/snapshots";

export async function saveContentScoreSnapshot(opts: {
  content: string;
  targetKeyword: string;
  result: ContentScoreResult;
}): Promise<{ ok: true; id: number }> {
  if (!opts.result.ok) {
    return Promise.reject(new Error("Can't save a failed score"));
  }
  return saveSnapshot({
    clientId: null,
    kind: "content_stats",
    label: opts.targetKeyword,
    note: `${opts.result.stats.wordCount} words`,
    data: opts.result,
    primaryMetric: opts.result.score,
    primaryMetricLabel: "score",
  });
}
