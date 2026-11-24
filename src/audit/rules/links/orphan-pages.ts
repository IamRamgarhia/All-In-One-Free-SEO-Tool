import { defineRule, fail, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const orphanPagesRule = defineRule({
  id: "links-orphan-pages",
  name: "Inbound Internal Links",
  description: "Measures how many internal pages link to this one; true zero-inbound orphans are covered by crawl-sitemap-orphan-urls",
  category: "links",
  weight: 6,
  run: (context) => {
    const site = context.site;
    if (!site) {
      return notMeasured(
        "links-orphan-pages",
        "Inbound link counting needs the site-wide link graph - only available in a site audit, not a single-page check"
      );
    }
    const url = site.normalize(context.url);
    const inbound = site.inboundLinksByUrl.get(url);
    const inboundCount = inbound?.size ?? 0;
    const outboundCount = site.outboundLinksByUrl.get(url)?.size ?? 0;
    const details = {
      inboundLinkCount: inboundCount,
      outboundInternalLinkCount: outboundCount,
      pagesCrawled: site.pageCount,
      linkedFrom: inbound ? Array.from(inbound).slice(0, 5) : []
    };
    if (url === site.entryUrl) {
      return pass(
        "links-orphan-pages",
        "Crawl entry point - pages inside the crawl are not expected to link back to where it started",
        details
      );
    }
    if (site.pageCount < 2) {
      return notMeasured(
        "links-orphan-pages",
        "Only one page was crawled, which is too few to measure inbound linking",
        details
      );
    }
    if (inboundCount === 0) {
      return fail(
        "links-orphan-pages",
        `No internal links point to this page across ${site.pageCount} crawled pages`,
        {
          ...details,
          impact: "Crawlers find pages by following links. An orphan is discoverable only via the sitemap or an external link, receives no internal link equity, and is easily missed during site changes."
        }
      );
    }
    if (inboundCount === 1) {
      return warn(
        "links-orphan-pages",
        "Only one internal link points to this page, so it is one edit away from being orphaned",
        details
      );
    }
    return pass(
      "links-orphan-pages",
      `${inboundCount} internal link(s) point to this page`,
      details
    );
  }
});
