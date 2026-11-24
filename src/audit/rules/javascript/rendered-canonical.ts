import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const renderedCanonicalRule = defineRule({
  id: "js-rendered-canonical",
  name: "Rendered Canonical Present",
  description: "Checks that a canonical link tag exists in the rendered DOM after JavaScript execution",
  category: "js",
  weight: 8,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-rendered-canonical",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const canonicalHref = rendered$('link[rel="canonical"]').attr("href")?.trim();
    if (!canonicalHref) {
      return fail(
        "js-rendered-canonical",
        "Canonical link tag is missing in the rendered DOM after JavaScript execution",
        {
          renderedCanonical: null,
          recommendation: 'Ensure your JavaScript framework injects <link rel="canonical"> during rendering'
        }
      );
    }
    return pass(
      "js-rendered-canonical",
      "Canonical link tag is present in the rendered DOM",
      { renderedCanonical: canonicalHref }
    );
  }
});
