import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";
import { looksPaginated } from "@/audit/rules/crawlability/site-page-utils";

export const paginationIsolatedRule = defineRule({
  id: "crawl-pagination-isolated",
  name: "Pagination URL Without Incoming Links",
  description: "Checks that paginated URLs receive at least one incoming internal link",
  category: "crawl",
  weight: 5,
  run: (context) => {
    const site = context.site;
    if (!site?.pages) {
      return notMeasured(
        "crawl-pagination-isolated",
        "Counting incoming links needs the site-wide crawl graph - only available in a site audit, not a single-page check"
      );
    }
    const url = site.normalize(context.url);
    const { paginated, label } = looksPaginated(context);
    if (!paginated) {
      return pass("crawl-pagination-isolated", "Page does not appear to be paginated", {
        isPaginated: false
      });
    }
    if (url === site.entryUrl) {
      return pass("crawl-pagination-isolated", "Crawl entry point", {
        isPaginated: true,
        matchedPattern: label
      });
    }
    const inboundCount = site.inboundLinksByUrl.get(url)?.size ?? 0;
    if (inboundCount === 0) {
      return fail(
        "crawl-pagination-isolated",
        `Paginated URL (${label}) has no incoming internal links`,
        {
          isPaginated: true,
          matchedPattern: label,
          inboundLinkCount: 0,
          impact: "Without anchor links, crawlers may never reach this page and it receives no internal link equity.",
          recommendation: 'Link to the pagination series from ordinary anchors (e.g. a pager in the body), not only rel="next"/"prev" tags.'
        }
      );
    }
    return pass(
      "crawl-pagination-isolated",
      `Paginated URL has ${inboundCount} incoming internal link(s)`,
      { isPaginated: true, matchedPattern: label, inboundLinkCount: inboundCount }
    );
  }
});
