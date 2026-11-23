import { calculateFleschKincaid, getReadingLevelDescription } from "@/audit/rules/content/utils/syllable-counter";
import { countSentences, extractMainContent, tokenize } from "@/audit/rules/content/utils/text-extractor";
import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const OPTIMAL_MIN2 = 60;
export const OPTIMAL_MAX2 = 70;
export const ACCEPTABLE_MIN = 50;
export const ACCEPTABLE_MAX = 80;
export const MIN_WORDS_FOR_CHECK = 50;
export const readingLevelRule = defineRule({
  id: "content-reading-level",
  name: "Reading Level",
  description: "Analyzes content readability using Flesch-Kincaid score",
  category: "content",
  weight: 3,
  run: async (context) => {
    const { $ } = context;
    // Flesch-Kincaid counts English syllables and is calibrated on English
    // sentences. On another language its grade means nothing: a plain French
    // page came out "Very Difficult (college graduate)". Not measured there.
    const lang = ($("html").attr("lang") || "").trim().toLowerCase();
    if (lang && !lang.startsWith("en")) {
      return notMeasured(
        "content-reading-level",
        `Readability formula is for English; page language is "${lang}"`,
        { lang, reason: "Flesch-Kincaid is calibrated on English text" },
      );
    }
    const mainContent = extractMainContent($);
    const words3 = tokenize(mainContent);
    const sentenceCount = countSentences(mainContent);
    if (words3.length < MIN_WORDS_FOR_CHECK) {
      return pass(
        "content-reading-level",
        `Content too short for readability analysis (${words3.length} words)`,
        {
          wordCount: words3.length,
          sentenceCount,
          skipped: true,
          reason: `Minimum ${MIN_WORDS_FOR_CHECK} words required for meaningful readability analysis`
        }
      );
    }
    const score = calculateFleschKincaid(words3, sentenceCount);
    const levelDescription = getReadingLevelDescription(score);
    const details = {
      score: parseFloat(score.toFixed(1)),
      levelDescription,
      wordCount: words3.length,
      sentenceCount,
      avgWordsPerSentence: parseFloat((words3.length / sentenceCount).toFixed(1)),
      thresholds: {
        optimal: { min: OPTIMAL_MIN2, max: OPTIMAL_MAX2 },
        acceptable: { min: ACCEPTABLE_MIN, max: ACCEPTABLE_MAX }
      }
    };
    if (score >= OPTIMAL_MIN2 && score <= OPTIMAL_MAX2) {
      return pass(
        "content-reading-level",
        `Optimal readability: ${details.score} (${levelDescription})`,
        {
          ...details,
          note: "Content is accessible to a general audience while maintaining substance"
        }
      );
    }
    if (score >= ACCEPTABLE_MIN && score <= ACCEPTABLE_MAX) {
      const isSimple = score > OPTIMAL_MAX2;
        return pass(
        "content-reading-level",
        `Acceptable readability: ${details.score} (${levelDescription})`,
        {
          ...details,
          recommendation: isSimple ? "Content may be too simple for some topics. Consider adding more technical depth if appropriate." : "Content could be simplified for broader accessibility. Use shorter sentences and simpler vocabulary."
        }
      );
    }
    if (score < ACCEPTABLE_MIN) {
      return warn(
        "content-reading-level",
        `Content may be too complex: ${details.score} (${levelDescription})`,
        {
          ...details,
          impact: "Complex content may alienate general audiences and reduce engagement",
          recommendation: "Simplify language by: using shorter sentences, replacing jargon with common words, breaking long paragraphs into smaller chunks, and using bullet points for lists.",
          note: "Technical content for expert audiences may legitimately score lower."
        }
      );
    }
    return warn(
      "content-reading-level",
      `Content may be too simplistic: ${details.score} (${levelDescription})`,
      {
        ...details,
        impact: "Overly simple content may appear thin or lack substance for competitive topics",
        recommendation: "Consider adding more depth and detail. Use varied sentence structures and include relevant technical terms where appropriate."
      }
    );
  }
});
