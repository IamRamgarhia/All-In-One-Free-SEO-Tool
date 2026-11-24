import { DOCUMENT_TITLE } from "@/audit/rules/document-title";
import { compareDomElement } from "@/audit/rules/javascript/utils/compare-dom";
import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const titleModifiedRule = defineRule({
  id: "js-title-modified",
  name: "Title Modified by JavaScript",
  description: "Checks if the page title is modified by JavaScript execution",
  category: "js",
  weight: 8,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-title-modified",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const comparison = compareDomElement(context.$, rendered$, DOCUMENT_TITLE);
    if (!comparison) {
      return pass(
        "js-title-modified",
        "Unable to compare title elements"
      );
    }
    if (!comparison.rawText && !comparison.renderedText) {
      return pass(
        "js-title-modified",
        "Title is not present in either raw or rendered DOM (no modification detected)",
        { rawTitle: null, renderedTitle: null }
      );
    }
    if (comparison.differs) {
      return warn(
        "js-title-modified",
        "Title was modified by JavaScript execution",
        {
          rawTitle: comparison.rawText || null,
          renderedTitle: comparison.renderedText || null,
          impact: "Search engines primarily use the raw HTML title; the JS-modified title may not be indexed",
          recommendation: "Set the correct title in server-side HTML rather than modifying it with JavaScript"
        }
      );
    }
    return pass(
      "js-title-modified",
      "Title is unchanged after JavaScript execution",
      {
        rawTitle: comparison.rawText,
        renderedTitle: comparison.renderedText
      }
    );
  }
});
