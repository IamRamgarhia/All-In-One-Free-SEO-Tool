import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const HREFLANG_CODE_PATTERN = /^[a-z]{2}(-[a-z]{2})?$/i;
export const hreflangIncomingInvalidRule = defineRule({
  id: "i18n-hreflang-incoming-invalid",
  name: "Invalid Incoming Hreflang Annotations",
  description: "Checks that hreflang annotations from other crawled pages targeting this URL use valid language/region codes",
  category: "i18n",
  weight: 8,
  run: (context) => {
    const site = context.site;
    if (!site?.pages) {
      return notMeasured(
        "i18n-hreflang-incoming-invalid",
        "Validating incoming hreflang annotations needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const ownKey = site.normalize(context.url);
    const invalid = [];
    let incomingCount = 0;
    for (const [sourceUrl, info] of site.pages) {
      if (sourceUrl === ownKey) continue;
      for (const [code, target] of Object.entries(info.hreflangOut)) {
        if (site.normalize(target) !== ownKey) continue;
        incomingCount++;
        if (code.trim().toLowerCase() === "x-default") continue;
        if (!HREFLANG_CODE_PATTERN.test(code.trim())) {
          invalid.push({ source: sourceUrl, hreflang: code });
        }
      }
    }
    if (invalid.length > 0) {
      return fail(
        "i18n-hreflang-incoming-invalid",
        `${invalid.length} incoming hreflang annotation(s) use invalid language/region codes`,
        {
          invalid: invalid.slice(0, 10),
          incomingCount,
          impact: "Annotations with invalid codes are ignored by search engines, so this page loses the declared cluster membership.",
          recommendation: 'Fix the annotations on the source pages to use valid ISO 639-1 language codes with optional ISO 3166-1 Alpha-2 region codes (e.g. "en", "en-GB").'
        }
      );
    }
    return pass(
      "i18n-hreflang-incoming-invalid",
      incomingCount === 0 ? "No other crawled page annotates this URL with hreflang" : "All incoming hreflang annotations use valid codes",
      { incomingCount }
    );
  }
});
