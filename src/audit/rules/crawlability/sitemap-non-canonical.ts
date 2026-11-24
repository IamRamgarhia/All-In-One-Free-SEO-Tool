import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const MAX_LISTED3 = 10;
export const sitemapNonCanonicalRule = defineRule({
  id: "crawl-sitemap-non-canonical",
  name: "Canonicalised URLs in Sitemap",
  description: "Flags sitemap URLs whose canonical link element resolves to a different URL",
  category: "crawl",
  weight: 7,
  run: (context) => {
    const site = context.site;
    const pages = site?.pages;
    const sitemapUrls = context.sitemapUrls;
    if (!site || !pages) {
      return notMeasured(
        "crawl-sitemap-non-canonical",
        "Per-page crawl data needs a multi-page crawl - only available in a site audit, not a single-page check"
      );
    }
    if (!sitemapUrls || sitemapUrls.length === 0) {
      return notMeasured(
        "crawl-sitemap-non-canonical",
        "No sitemap URLs available to cross-reference against canonicals"
      );
    }
    const canonicalised = [];
    let checked = 0;
    let notCrawled = 0;
    for (const url of sitemapUrls) {
      const key = site.normalize(url);
      const info = pages.get(key);
      if (!info) {
        notCrawled++;
        continue;
      }
      checked++;
      if (typeof info.canonical !== "string") {
        continue;
      }
      if (site.normalize(info.canonical) !== key) {
        canonicalised.push({ url, canonical: info.canonical });
      }
    }
    const details = {
      sitemapUrlCount: sitemapUrls.length,
      checkedCount: checked,
      notCrawledCount: notCrawled,
      canonicalisedCount: canonicalised.length,
      canonicalisedUrls: canonicalised.slice(0, MAX_LISTED3)
    };
    if (canonicalised.length > 0) {
      return fail(
        "crawl-sitemap-non-canonical",
        `${canonicalised.length} sitemap URL(s) canonicalise to a different URL`,
        {
          ...details,
          impact: "The sitemap asks crawlers to index URLs the pages themselves disown, so the entries are ignored and the intended targets may be missing from the sitemap.",
          recommendation: "List the canonical targets in the sitemap instead of URLs that canonicalise away."
        }
      );
    }
    return pass(
      "crawl-sitemap-non-canonical",
      `No sitemap URLs canonicalise to a different URL (${checked} checked)`,
      details
    );
  }
});
