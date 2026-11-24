import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const renderedLinksRule = defineRule({
  id: "js-rendered-links",
  name: "Rendered Links Dependency",
  description: "Checks if important links are only present after JavaScript rendering",
  category: "js",
  weight: 7,
  run: async (context) => {
    const rendered$ = context.rendered$;
    if (!rendered$) {
      return notMeasured(
        "js-rendered-links",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to enable JavaScript rendering checks"
      );
    }
    const rawLinks = context.$("a[href]").length;
    const renderedLinks = rendered$("a[href]").length;
    const linkDifference = renderedLinks - rawLinks;
    const details = {
      rawLinkCount: rawLinks,
      renderedLinkCount: renderedLinks,
      addedByJs: linkDifference > 0 ? linkDifference : 0
    };
    if (renderedLinks > rawLinks * 2 && linkDifference > 10) {
      return warn(
        "js-rendered-links",
        `JavaScript adds ${linkDifference} links to the page; most links are not in raw HTML`,
        {
          ...details,
          impact: "Search engines may miss JS-rendered links during initial crawling",
          recommendation: "Include critical navigation and internal links in server-side HTML for reliable discovery"
        }
      );
    }
    return pass(
      "js-rendered-links",
      "Links are mostly present in raw HTML",
      details
    );
  }
});
