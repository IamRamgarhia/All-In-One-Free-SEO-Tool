import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";

export const robotsTxtExistsRule = defineRule({
  id: "technical-robots-txt-exists",
  category: "technical",
  severity: "medium",
  weight: 8,
  title: "robots.txt accessible",
  description: "Site should expose a robots.txt",
  recommendation: "Publish https://example.com/robots.txt with clear Allow/Disallow rules.",
  requiresCrawl: true,
  check: async ({ crawl }) => {
    if (!crawl) return warn("Crawl context missing");
    if (crawl.robotsTxt == null) return fail("robots.txt could not be fetched");
    if (!crawl.robotsTxt.trim()) return warn("robots.txt is empty");
    return pass("robots.txt is accessible");
  },
});

export const robotsTxtValidRule = defineRule({
  id: "technical-robots-txt-valid",
  category: "technical",
  severity: "medium",
  weight: 6,
  title: "robots.txt looks valid",
  description: "Basic syntax checks for User-agent / Disallow lines",
  recommendation: "Fix robots.txt syntax; ensure at least one User-agent group.",
  requiresCrawl: true,
  check: async ({ crawl }) => {
    const raw = crawl?.robotsTxt;
    if (!raw) return fail("No robots.txt content");
    if (!/user-agent\s*:/i.test(raw)) {
      return warn("robots.txt has no User-agent directive");
    }
    return pass("robots.txt has a User-agent group");
  },
});

export const sitemapExistsRule = defineRule({
  id: "technical-sitemap-exists",
  category: "technical",
  severity: "high",
  weight: 12,
  title: "Sitemap present",
  description: "Site should expose a sitemap.xml (or via robots.txt)",
  recommendation: "Publish a sitemap and reference it from robots.txt.",
  requiresCrawl: true,
  check: async ({ crawl }) => {
    if (!crawl) return warn("Crawl context missing");
    if (crawl.sitemapUrls.length === 0) return fail("No sitemap URLs discovered");
    return pass(`Discovered sitemap with ${crawl.sitemapUrls.length} URL(s)`, {
      count: crawl.sitemapUrls.length,
    });
  },
});

export const sitemapValidRule = defineRule({
  id: "technical-sitemap-valid",
  category: "technical",
  severity: "medium",
  weight: 6,
  title: "Sitemap has URLs",
  description: "Sitemap should list at least one loc",
  recommendation: "Ensure the sitemap contains <loc> entries for indexable pages.",
  requiresCrawl: true,
  check: async ({ crawl }) => {
    if (!crawl || crawl.sitemapUrls.length === 0) return fail("No sitemap URLs");
    return pass("Sitemap contains URL entries");
  },
});
