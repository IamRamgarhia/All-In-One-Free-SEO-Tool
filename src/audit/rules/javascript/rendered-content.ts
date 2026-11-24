import { bodyText } from "@/audit/rules/content/utils/visible-text";
import { defineRule, fail, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const renderedContentRule = defineRule({
  id: "js-rendered-content",
  name: "Rendered Content Dependency",
  description: "Checks if significant content is only present after JavaScript rendering",
  category: "js",
  weight: 8,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-rendered-content",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const rawLen = bodyText(context.$).length;
    const renderedLen = bodyText(rendered$).length;
    const details = {
      rawContentLength: rawLen,
      renderedContentLength: renderedLen,
      ratio: rawLen > 0 ? (renderedLen / rawLen).toFixed(2) : "N/A"
    };
    if (rawLen < 100 && renderedLen > 500) {
      return fail(
        "js-rendered-content",
        "Page is essentially empty without JavaScript; all content is client-side rendered",
        {
          ...details,
          impact: "Search engines that do not execute JavaScript will see an empty page",
          recommendation: "Implement server-side rendering (SSR) or static generation to include content in raw HTML"
        }
      );
    }
    if (renderedLen > rawLen * 3) {
      return warn(
        "js-rendered-content",
        "Most page content is injected by JavaScript; raw HTML has significantly less content",
        {
          ...details,
          impact: "Search engines may not index all content if JavaScript rendering is delayed or fails",
          recommendation: "Consider server-side rendering for critical content to ensure indexability"
        }
      );
    }
    return pass(
      "js-rendered-content",
      "Page content is mostly present in raw HTML",
      details
    );
  }
});
