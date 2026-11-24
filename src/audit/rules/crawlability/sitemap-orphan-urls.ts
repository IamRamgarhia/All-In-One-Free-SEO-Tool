import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";
import { registerResettable } from "@/audit/engine/rule-registry";

export const crawledUrls = /* @__PURE__ */ new Set();
export const sitemapCheckUrls = /* @__PURE__ */ new Set();
export function normalizeUrl10(url: string) {
  try {
    const urlObj = new URL(url);
    let path3 = urlObj.pathname;
    if (path3.length > 1 && path3.endsWith("/")) {
      path3 = path3.slice(0, -1);
    }
    return `${urlObj.protocol}//${urlObj.host.toLowerCase()}${path3}${urlObj.search}`;
  } catch {
    return url.toLowerCase().replace(/\/$/, "");
  }
}
export function resetOrphanRegistry() {
  crawledUrls.clear();
  sitemapCheckUrls.clear();
}
registerResettable(resetOrphanRegistry);
export const sitemapOrphanUrlsRule = defineRule({
  id: "crawl-sitemap-orphan-urls",
  name: "Sitemap Orphan URLs",
  description: "Checks if sitemap contains URLs not linked from any crawled page",
  category: "crawl",
  weight: 7,
  run: async (context) => {
    if (!context.site) {
      return notMeasured("crawl-sitemap-orphan-urls", "Orphan detection needs the links of crawled pages - only available in a site audit, not a single-page check");
    }
    const { links, url } = context;
    const sitemapUrls = context.sitemapUrls;
    crawledUrls.add(normalizeUrl10(url));
    for (const link of links) {
      if (link.isInternal && link.href) {
        try {
          const absoluteHref = new URL(link.href, url).href;
          crawledUrls.add(normalizeUrl10(absoluteHref));
        } catch {
        }
      }
    }
    if (sitemapUrls && sitemapUrls.length > 0) {
      for (const sitemapUrl of sitemapUrls) {
        sitemapCheckUrls.add(normalizeUrl10(sitemapUrl));
      }
    }
    const orphanUrls = [];
    for (const sitemapUrl of sitemapCheckUrls) {
      if (!crawledUrls.has(sitemapUrl)) {
        orphanUrls.push(sitemapUrl);
      }
    }
    const details = {
      crawledUrlCount: crawledUrls.size,
      sitemapUrlCount: sitemapCheckUrls.size,
      orphanCount: orphanUrls.length,
      orphanUrls: orphanUrls.slice(0, 10)
    };
    if (sitemapCheckUrls.size === 0) {
      return pass(
        "crawl-sitemap-orphan-urls",
        "No sitemap URLs available for orphan detection",
        { ...details, note: "Data is being collected for cross-page analysis" }
      );
    }
    if (orphanUrls.length > 0) {
      const orphanPercent = (orphanUrls.length / sitemapCheckUrls.size * 100).toFixed(1);
      return warn(
        "crawl-sitemap-orphan-urls",
        `${orphanUrls.length} sitemap URL(s) (${orphanPercent}%) are not linked from any crawled page`,
        {
          ...details,
          impact: "Orphan pages lack internal links, reducing discoverability and crawl priority",
          recommendation: "Add internal links to orphan pages or remove them from the sitemap if obsolete"
        }
      );
    }
    return pass(
      "crawl-sitemap-orphan-urls",
      `All ${sitemapCheckUrls.size} sitemap URLs are linked from crawled pages`,
      details
    );
  }
});
