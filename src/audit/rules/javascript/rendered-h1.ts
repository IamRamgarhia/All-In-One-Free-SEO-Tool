import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const renderedH1Rule = defineRule({
  id: "js-rendered-h1",
  name: "Rendered H1 Present",
  description: "Checks that an H1 heading exists in the rendered DOM after JavaScript execution",
  category: "js",
  weight: 8,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-rendered-h1",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const h1Text = rendered$("h1").first().text().trim();
    if (!h1Text) {
      return fail(
        "js-rendered-h1",
        "H1 heading is missing or empty in the rendered DOM after JavaScript execution",
        {
          renderedH1: null,
          recommendation: "Ensure your JavaScript framework renders an H1 heading element"
        }
      );
    }
    return pass(
      "js-rendered-h1",
      "H1 heading is present in the rendered DOM",
      { renderedH1: h1Text }
    );
  }
});
