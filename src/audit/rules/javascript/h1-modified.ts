import { compareDomElement } from "@/audit/rules/javascript/utils/compare-dom";
import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const h1ModifiedRule = defineRule({
  id: "js-h1-modified",
  name: "H1 Modified by JavaScript",
  description: "Checks if the H1 heading is modified by JavaScript execution",
  category: "js",
  weight: 7,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-h1-modified",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const comparison = compareDomElement(context.$, rendered$, "h1");
    if (!comparison) {
      return pass(
        "js-h1-modified",
        "Unable to compare H1 elements"
      );
    }
    if (!comparison.rawText && !comparison.renderedText) {
      return pass(
        "js-h1-modified",
        "H1 is not present in either raw or rendered DOM (no modification detected)",
        { rawH1: null, renderedH1: null }
      );
    }
    if (comparison.differs) {
      return warn(
        "js-h1-modified",
        "H1 heading was modified by JavaScript execution",
        {
          rawH1: comparison.rawText || null,
          renderedH1: comparison.renderedText || null,
          impact: "Search engines may index the raw HTML H1; the JS-modified heading may not be used",
          recommendation: "Set the correct H1 heading in server-side HTML rather than modifying it with JavaScript"
        }
      );
    }
    return pass(
      "js-h1-modified",
      "H1 heading is unchanged after JavaScript execution",
      {
        rawH1: comparison.rawText,
        renderedH1: comparison.renderedText
      }
    );
  }
});
