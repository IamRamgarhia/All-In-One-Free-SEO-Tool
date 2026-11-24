import { compareAttribute } from "@/audit/rules/javascript/utils/compare-dom";
import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const canonicalMismatchRule = defineRule({
  id: "js-canonical-mismatch",
  name: "Canonical Mismatch (Raw vs Rendered)",
  description: "Checks if the canonical URL differs between raw HTML and rendered DOM",
  category: "js",
  weight: 10,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-canonical-mismatch",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const comparison = compareAttribute(
      context.$,
      rendered$,
      'link[rel="canonical"]',
      "href"
    );
    if (!comparison) {
      return pass(
        "js-canonical-mismatch",
        "Unable to compare canonical tags"
      );
    }
    if (!comparison.rawValue && !comparison.renderedValue) {
      return pass(
        "js-canonical-mismatch",
        "Canonical tag not present in either raw or rendered DOM (no mismatch)",
        { rawCanonical: null, renderedCanonical: null }
      );
    }
    if (comparison.differs) {
      return fail(
        "js-canonical-mismatch",
        "Canonical URL changed after JavaScript execution",
        {
          rawCanonical: comparison.rawValue || null,
          renderedCanonical: comparison.renderedValue || null,
          impact: "Search engines may see different canonical URLs depending on JS execution",
          recommendation: "Ensure the canonical URL is consistent in both raw HTML and after JS rendering"
        }
      );
    }
    return pass(
      "js-canonical-mismatch",
      "Canonical URL is consistent between raw and rendered DOM",
      {
        rawCanonical: comparison.rawValue,
        renderedCanonical: comparison.renderedValue
      }
    );
  }
});
