import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const renderedDescriptionRule = defineRule({
  id: "js-rendered-description",
  name: "Rendered Meta Description Present",
  description: "Checks that a meta description exists in the rendered DOM after JavaScript execution",
  category: "js",
  weight: 8,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-rendered-description",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const description = rendered$('meta[name="description"]').attr("content")?.trim();
    if (!description) {
      return fail(
        "js-rendered-description",
        "Meta description is missing in the rendered DOM after JavaScript execution",
        {
          renderedDescription: null,
          recommendation: 'Ensure your JavaScript framework injects <meta name="description"> during rendering'
        }
      );
    }
    return pass(
      "js-rendered-description",
      "Meta description is present in the rendered DOM",
      { renderedDescription: description }
    );
  }
});
