import type { CheerioAPI } from "cheerio";
import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export function hasRobotsDirective($: CheerioAPI, directive: string) {
  const robotsContent = $('meta[name="robots"]').attr("content") || "";
  return new RegExp(directive, "i").test(robotsContent);
}
export const noindexMismatchRule = defineRule({
  id: "js-noindex-mismatch",
  name: "Noindex/Nofollow Mismatch (Raw vs Rendered)",
  description: "Checks if the noindex or nofollow directives change between raw HTML and rendered DOM",
  category: "js",
  weight: 10,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-noindex-mismatch",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const rawHasNoindex = hasRobotsDirective(context.$, "noindex");
    const renderedHasNoindex = hasRobotsDirective(rendered$, "noindex");
    const rawHasNofollow = hasRobotsDirective(context.$, "nofollow");
    const renderedHasNofollow = hasRobotsDirective(rendered$, "nofollow");
    const changes = [];
    if (rawHasNoindex !== renderedHasNoindex) {
      changes.push(
        rawHasNoindex ? "JavaScript removed the noindex directive (page becomes indexable after JS)" : "JavaScript added a noindex directive (page becomes hidden after JS)"
      );
    }
    if (rawHasNofollow !== renderedHasNofollow) {
      changes.push(
        rawHasNofollow ? "JavaScript removed the nofollow directive (page links become followed after JS)" : "JavaScript added a nofollow directive (page links become unfollowed after JS)"
      );
    }
    if (changes.length > 0) {
      return fail(
        "js-noindex-mismatch",
        `Robots directives changed after JavaScript execution: ${changes.join("; ")}`,
        {
          rawHasNoindex,
          renderedHasNoindex,
          rawHasNofollow,
          renderedHasNofollow,
          direction: changes.join("; "),
          impact: "Search engines may index, de-index, or follow links inconsistently depending on JS execution",
          recommendation: "Set noindex/nofollow directives in server-side HTML, not via client-side JavaScript"
        }
      );
    }
    return pass(
      "js-noindex-mismatch",
      "Noindex and nofollow status is consistent between raw and rendered DOM",
      { rawHasNoindex, renderedHasNoindex, rawHasNofollow, renderedHasNofollow }
    );
  }
});
