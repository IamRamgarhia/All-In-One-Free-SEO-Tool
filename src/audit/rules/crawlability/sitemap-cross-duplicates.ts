import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const MAX_LISTED5 = 10;
export const sitemapCrossDuplicatesRule = defineRule({
  id: "crawl-sitemap-cross-duplicates",
  name: "URLs in Multiple Sitemaps",
  description: "Flags page URLs declared by more than one sitemap document",
  category: "crawl",
  weight: 2,
  run: (context) => {
    const site = context.site;
    const pages = site?.pages;
    const sitemapUrls = context.sitemapUrls;
    if (!site || !pages) {
      return notMeasured(
        "crawl-sitemap-cross-duplicates",
        "Per-page crawl data needs a multi-page crawl - only available in a site audit, not a single-page check"
      );
    }
    if (!sitemapUrls || sitemapUrls.length === 0) {
      return notMeasured(
        "crawl-sitemap-cross-duplicates",
        "No sitemap URLs available to check for cross-sitemap duplication"
      );
    }
    const urlSources = context.sitemapUrlSources;
    if (!urlSources) {
      return notMeasured(
        "crawl-sitemap-cross-duplicates",
        "Which sitemap documents declared each URL was not recorded, so cross-sitemap duplication cannot be checked"
      );
    }
    const duplicates = [];
    for (const [url, sources] of urlSources) {
      if (sources.length > 1) {
        duplicates.push({ url, sitemaps: sources });
      }
    }
    const details = {
      sitemapUrlCount: sitemapUrls.length,
      trackedUrlCount: urlSources.size,
      duplicateCount: duplicates.length,
      duplicateUrls: duplicates.slice(0, MAX_LISTED5)
    };
    if (duplicates.length > 0) {
      return warn(
        "crawl-sitemap-cross-duplicates",
        `${duplicates.length} URL(s) are declared in more than one sitemap document`,
        {
          ...details,
          impact: "Overlapping sitemap declarations are harmless to crawlers but usually signal unclear sitemap ownership.",
          recommendation: "Assign each URL to a single sitemap so coverage reporting stays meaningful."
        }
      );
    }
    return pass(
      "crawl-sitemap-cross-duplicates",
      `No URL is declared by more than one sitemap document (${urlSources.size} URLs tracked)`,
      details
    );
  }
});
