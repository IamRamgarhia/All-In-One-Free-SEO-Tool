import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const MAX_LISTED4 = 10;
export const sitemapDisallowedRule = defineRule({
  id: "crawl-sitemap-disallowed",
  name: "Disallowed URLs in Sitemap",
  description: "Flags sitemap URLs that robots.txt disallows, a direct contradiction of crawl signals",
  category: "crawl",
  weight: 7,
  run: (context) => {
    const site = context.site;
    const pages = site?.pages;
    const sitemapUrls = context.sitemapUrls;
    if (!site || !pages) {
      return notMeasured(
        "crawl-sitemap-disallowed",
        "Per-page crawl data needs a multi-page crawl - only available in a site audit, not a single-page check"
      );
    }
    if (!sitemapUrls || sitemapUrls.length === 0) {
      return notMeasured(
        "crawl-sitemap-disallowed",
        "No sitemap URLs available to cross-reference against robots.txt"
      );
    }
    const disallowedUrls = [];
    let checked = 0;
    let notCrawled = 0;
    for (const url of sitemapUrls) {
      const info = pages.get(site.normalize(url));
      if (!info) {
        notCrawled++;
        continue;
      }
      checked++;
      if (info.disallowed) {
        disallowedUrls.push(url);
      }
    }
    const details = {
      sitemapUrlCount: sitemapUrls.length,
      checkedCount: checked,
      notCrawledCount: notCrawled,
      disallowedCount: disallowedUrls.length,
      disallowedUrls: disallowedUrls.slice(0, MAX_LISTED4)
    };
    if (disallowedUrls.length > 0) {
      return fail(
        "crawl-sitemap-disallowed",
        `${disallowedUrls.length} sitemap URL(s) are disallowed by robots.txt`,
        {
          ...details,
          impact: "Disallowed pages cannot be crawled, so search engines may index them blind or drop them; either way the sitemap entry contradicts robots.txt.",
          recommendation: "Remove the URLs from the sitemap or allow them in robots.txt - whichever reflects intent."
        }
      );
    }
    const anyDisallowed = [...pages.values()].some((p) => p.disallowed);
    if (!anyDisallowed && !context.robotsTxtContent) {
      return notMeasured(
        "crawl-sitemap-disallowed",
        "robots.txt was not fetched, so disallow status of sitemap URLs is unknown",
        details
      );
    }
    return pass(
      "crawl-sitemap-disallowed",
      `No sitemap URLs are disallowed by robots.txt (${checked} checked)`,
      details
    );
  }
});
