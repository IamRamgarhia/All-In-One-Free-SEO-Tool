import { defineRule, fail, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const MAX_RECOMMENDED_DEPTH = 3;
export const SEVERE_DEPTH = 5;
export const depthRule = defineRule({
  id: "links-depth",
  name: "Page Depth",
  description: "Checks click distance from the crawl entry point (more than 3 clicks is hard to reach)",
  category: "links",
  weight: 4,
  run: (context) => {
    const site = context.site;
    if (!site) {
      return notMeasured(
        "links-depth",
        "Click depth needs the site-wide link graph - only available in a site audit, not a single-page check"
      );
    }
    const url = site.normalize(context.url);
    const depth = site.depthByUrl.get(url);
    if (depth === void 0) {
      return notMeasured("links-depth", "Page was not reached by following links from the entry point", {
        url
      });
    }
    const details = {
      depth,
      entryUrl: site.entryUrl,
      maxRecommended: MAX_RECOMMENDED_DEPTH,
      pagesCrawled: site.pageCount
    };
    if (depth === 0) {
      return pass("links-depth", "Crawl entry point (depth 0)", details);
    }
    if (depth > SEVERE_DEPTH) {
      return fail(
        "links-depth",
        `Page is ${depth} clicks from the entry point, well beyond the ${MAX_RECOMMENDED_DEPTH}-click guideline`,
        {
          ...details,
          impact: "Deeply buried pages are crawled less often and inherit little internal link equity. Link to them from a hub or category page closer to the entry point."
        }
      );
    }
    if (depth > MAX_RECOMMENDED_DEPTH) {
      return warn(
        "links-depth",
        `Page is ${depth} clicks from the entry point (more than the recommended ${MAX_RECOMMENDED_DEPTH})`,
        details
      );
    }
    return pass(
      "links-depth",
      `Page is ${depth} click(s) from the entry point`,
      details
    );
  }
});
