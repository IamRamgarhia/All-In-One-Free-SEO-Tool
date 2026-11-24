import { defineRule, fail, notMeasured, pass, warn } from "@/audit/engine/define-rule";
import { extractMainContent } from "@/audit/rules/content/utils/text-extractor";
import { registerResettable } from "@/audit/engine/rule-registry";

export const DUPLICATE_THRESHOLD = 0.8;
export const SIMILAR_THRESHOLD = 0.6;
export const MAX_WORDS = 500;
export const nearDuplicateRegistry: Array<{ url: string; trigrams: Set<unknown>; }> = [];
export function resetNearDuplicateRegistry() {
  nearDuplicateRegistry.length = 0;
}
registerResettable(resetNearDuplicateRegistry);
export function extractTrigrams(text: string) {
  const words3 = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 0).slice(0, MAX_WORDS);
  const trigrams = /* @__PURE__ */ new Set();
  for (let i = 0; i <= words3.length - 3; i++) {
    trigrams.add(`${words3[i]} ${words3[i + 1]} ${words3[i + 2]}`);
  }
  return trigrams;
}
export function jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>) {
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersectionSize = 0;
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const item of smaller) {
    if (larger.has(item)) {
      intersectionSize++;
    }
  }
  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}
export const duplicateNearRule = defineRule({
  id: "content-duplicate-near",
  name: "Near-Duplicate Content",
  description: "Detects near-duplicate content across crawled pages using trigram similarity",
  category: "content",
  weight: 7,
  run: async (context) => {
    if (!context.site) {
      return notMeasured("content-duplicate-near", "Near-duplicate detection needs other pages to compare against - only available in a site audit, not a single-page check");
    }
    const { $, url } = context;
    const bodyText2 = extractMainContent($).replace(/\s+/g, " ").trim();
    if (!bodyText2 || bodyText2.length < 100) {
      return pass(
        "content-duplicate-near",
        "Page has insufficient content for near-duplicate detection",
        {
          url,
          textLength: bodyText2.length,
          reason: "skipped"
        }
      );
    }
    const trigrams = extractTrigrams(bodyText2);
    if (trigrams.size < 5) {
      nearDuplicateRegistry.push({ url, trigrams });
      return pass(
        "content-duplicate-near",
        "Page has too few word trigrams for reliable comparison",
        {
          url,
          trigramCount: trigrams.size,
          reason: "skipped"
        }
      );
    }
    let highestSimilarity = 0;
    let mostSimilarUrl = "";
    for (const stored of nearDuplicateRegistry) {
      const similarity = jaccardSimilarity(trigrams, stored.trigrams);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        mostSimilarUrl = stored.url;
      }
    }
    nearDuplicateRegistry.push({ url, trigrams });
    const roundedSimilarity = Math.round(highestSimilarity * 100) / 100;
    const details = {
      url,
      trigramCount: trigrams.size,
      highestSimilarity: roundedSimilarity,
      mostSimilarUrl: mostSimilarUrl || null,
      thresholds: {
        duplicate: DUPLICATE_THRESHOLD,
        similar: SIMILAR_THRESHOLD
      }
    };
    if (highestSimilarity > DUPLICATE_THRESHOLD) {
      return fail(
        "content-duplicate-near",
        `Near-duplicate content detected: ${Math.round(highestSimilarity * 100)}% similar to ${mostSimilarUrl}`,
        {
          ...details,
          impact: "Near-duplicate pages cause keyword cannibalization and confuse search engines about which page to rank",
          recommendation: "Consolidate similar pages, differentiate their content significantly, or use canonical tags to indicate the preferred version."
        }
      );
    }
    if (highestSimilarity > SIMILAR_THRESHOLD) {
      return warn(
        "content-duplicate-near",
        `Similar content detected: ${Math.round(highestSimilarity * 100)}% similar to ${mostSimilarUrl}`,
        {
          ...details,
          impact: "Highly similar content may compete with itself in search rankings",
          recommendation: "Review both pages and differentiate their content, titles, and meta descriptions to target different search intents."
        }
      );
    }
    return pass(
      "content-duplicate-near",
      mostSimilarUrl ? `Content is sufficiently unique (highest similarity: ${Math.round(highestSimilarity * 100)}%)` : "First page analyzed (no comparison available yet)",
      details
    );
  }
});
