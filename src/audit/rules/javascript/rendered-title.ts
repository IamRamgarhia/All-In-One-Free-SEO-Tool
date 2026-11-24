import { DOCUMENT_TITLE } from "@/audit/rules/document-title";
import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const renderedTitleRule = defineRule({
  id: "js-rendered-title",
  name: "Rendered Title Present",
  description: "Checks that a <title> tag exists in the rendered DOM after JavaScript execution",
  category: "js",
  weight: 10,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-rendered-title",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const titleText = rendered$(DOCUMENT_TITLE).first().text().trim();
    if (!titleText) {
      return fail(
        "js-rendered-title",
        "Title tag is missing or empty in the rendered DOM after JavaScript execution",
        {
          renderedTitle: titleText || null,
          recommendation: "Ensure your JavaScript framework injects the <title> tag during rendering"
        }
      );
    }
    return pass(
      "js-rendered-title",
      "Title tag is present in the rendered DOM",
      { renderedTitle: titleText }
    );
  }
});
