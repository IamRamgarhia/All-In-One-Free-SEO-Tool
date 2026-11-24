import { compareAttribute } from "@/audit/rules/javascript/utils/compare-dom";
import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const descriptionModifiedRule = defineRule({
  id: "js-description-modified",
  name: "Meta Description Modified by JavaScript",
  description: "Checks if the meta description is modified by JavaScript execution",
  category: "js",
  weight: 7,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-description-modified",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const comparison = compareAttribute(
      context.$,
      rendered$,
      'meta[name="description"]',
      "content"
    );
    if (!comparison) {
      return pass(
        "js-description-modified",
        "Unable to compare meta description elements"
      );
    }
    if (!comparison.rawValue && !comparison.renderedValue) {
      return pass(
        "js-description-modified",
        "Meta description is not present in either raw or rendered DOM (no modification detected)",
        { rawDescription: null, renderedDescription: null }
      );
    }
    if (comparison.differs) {
      return warn(
        "js-description-modified",
        "Meta description was modified by JavaScript execution",
        {
          rawDescription: comparison.rawValue || null,
          renderedDescription: comparison.renderedValue || null,
          impact: "Search engines may use the raw HTML description for search result snippets",
          recommendation: "Set the correct meta description in server-side HTML rather than modifying it with JavaScript"
        }
      );
    }
    return pass(
      "js-description-modified",
      "Meta description is unchanged after JavaScript execution",
      {
        rawDescription: comparison.rawValue,
        renderedDescription: comparison.renderedValue
      }
    );
  }
});
