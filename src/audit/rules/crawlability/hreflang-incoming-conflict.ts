import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const hreflangIncomingConflictRule = defineRule({
  id: "crawl-hreflang-incoming-conflict",
  name: "Conflicting Incoming Hreflang Annotations",
  description: "Checks that other crawled pages do not annotate this URL with conflicting hreflang codes",
  category: "crawl",
  weight: 7,
  run: (context) => {
    const site = context.site;
    if (!site?.pages) {
      return notMeasured(
        "crawl-hreflang-incoming-conflict",
        "Comparing incoming hreflang annotations needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const ownKey = site.normalize(context.url);
    const sourcesByCode = /* @__PURE__ */ new Map();
    for (const [sourceUrl, info] of site.pages) {
      if (sourceUrl === ownKey) continue;
      for (const [code, target] of Object.entries(info.hreflangOut)) {
        if (site.normalize(target) !== ownKey) continue;
        const normalizedCode = code.trim().toLowerCase();
        if (!sourcesByCode.has(normalizedCode)) sourcesByCode.set(normalizedCode, /* @__PURE__ */ new Set());
        sourcesByCode.get(normalizedCode).add(sourceUrl);
      }
    }
    sourcesByCode.delete("x-default");
    if (sourcesByCode.size === 0) {
      return pass(
        "crawl-hreflang-incoming-conflict",
        "No other crawled page annotates this URL with hreflang",
        { incomingCodes: [] }
      );
    }
    if (sourcesByCode.size === 1) {
      const [code, sources] = Array.from(sourcesByCode.entries())[0];
      return pass(
        "crawl-hreflang-incoming-conflict",
        `Incoming hreflang annotations agree: this URL is "${code}"`,
        {
          incomingCodes: [code],
          sources: Array.from(sources).slice(0, 10)
        }
      );
    }
    const conflicts = Array.from(sourcesByCode.entries()).map(([code, sources]) => ({
      hreflang: code,
      sources: Array.from(sources).slice(0, 5)
    }));
    return fail(
      "crawl-hreflang-incoming-conflict",
      `Other pages annotate this URL with ${sourcesByCode.size} different hreflang codes`,
      {
        conflicts,
        impact: "Search engines receive contradictory signals about which language/region version this URL is, and may ignore the hreflang cluster entirely.",
        recommendation: "Make every page in the hreflang cluster annotate each member URL with the same single language/region code."
      }
    );
  }
});
