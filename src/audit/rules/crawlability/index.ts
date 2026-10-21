import { defineRule, fail, pass, unmeasured, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";
import {
  normalizeUrl,
  orphanPages,
  pagesBeyondDepth,
} from "@/audit/crawler/link-graph";

export const orphanPagesRule = defineRule({
  id: "crawl-orphan-pages",
  category: "crawlability",
  severity: "high",
  weight: 12,
  title: "No orphan pages in crawl",
  description: "Crawled pages (except start) should have inbound internal links",
  recommendation: "Add internal links to orphan pages from relevant content or nav.",
  requiresCrawl: true,
  check: async ({ crawl }) => {
    if (!crawl || crawl.pages.length < 2) {
      return unmeasured("Needs a multi-page crawl");
    }
    const orphans = orphanPages(crawl.pages, crawl.inbound, crawl.startUrl);
    if (orphans.length > 0) {
      return warn(`${orphans.length} orphan page(s) in crawl`, {
        samples: orphans.slice(0, 10),
      });
    }
    return pass("No orphan pages in this crawl");
  },
});

export const clickDepthRule = defineRule({
  id: "crawl-click-depth",
  category: "crawlability",
  severity: "medium",
  weight: 10,
  title: "Click depth ≤ 3",
  description: "Important pages should be within 3 clicks of the start URL",
  recommendation: "Improve internal linking so key pages are closer to the homepage.",
  requiresCrawl: true,
  check: async ({ crawl }) => {
    if (!crawl || crawl.pages.length < 2) {
      return unmeasured("Needs a multi-page crawl");
    }
    const deep = pagesBeyondDepth(crawl.pages, 3);
    if (deep.length > 0) {
      return warn(`${deep.length} page(s) deeper than 3 clicks`, {
        samples: deep.slice(0, 10),
      });
    }
    return pass("All crawled pages are within 3 clicks");
  },
});

export const sitemapCoverageRule = defineRule({
  id: "crawl-sitemap-coverage",
  category: "crawlability",
  severity: "medium",
  weight: 8,
  title: "Crawled pages appear in sitemap",
  description: "Indexable crawled URLs should be listed in the sitemap",
  recommendation: "Add missing indexable URLs to the sitemap.",
  requiresCrawl: true,
  check: async ({ page, crawl }) => {
    if (!crawl || crawl.sitemapUrls.length === 0) {
      return unmeasured("No sitemap URLs available");
    }
    const set = new Set(crawl.sitemapUrls.map(normalizeUrl));
    const url = normalizeUrl(page.finalUrl);
    if (!set.has(url)) {
      return warn("Page not found in sitemap", { url });
    }
    return pass("Page is listed in the sitemap");
  },
});

export const sitemapNon200Rule = defineRule({
  id: "crawl-sitemap-non-200",
  category: "crawlability",
  severity: "high",
  weight: 10,
  title: "Sitemap URLs return 200 when crawled",
  description: "URLs listed in the sitemap should be reachable",
  recommendation: "Remove dead URLs from the sitemap or fix their responses.",
  requiresCrawl: true,
  check: async ({ crawl }) => {
    if (!crawl || crawl.sitemapUrls.length === 0) {
      return unmeasured("No sitemap");
    }
    const sitemapSet = new Set(crawl.sitemapUrls.map(normalizeUrl));
    const bad = crawl.pages.filter(
      (p) => sitemapSet.has(normalizeUrl(p.finalUrl)) && (p.status < 200 || p.status >= 400),
    );
    if (bad.length > 0) {
      return fail(`${bad.length} sitemap URL(s) returned errors in crawl`, {
        samples: bad.slice(0, 5).map((p) => ({ url: p.finalUrl, status: p.status })),
      });
    }
    return pass("Crawled sitemap URLs look healthy");
  },
});

export const robotsBlockedRule = defineRule({
  id: "crawl-robots-blocked",
  category: "crawlability",
  severity: "critical",
  weight: 15,
  title: "Start URL not blocked by robots.txt",
  description: "The audited start URL should be allowed in robots.txt",
  recommendation: "Remove Disallow rules that block important sections.",
  requiresCrawl: true,
  check: async ({ crawl, page }) => {
    if (!crawl) return unmeasured("No crawl");
    const blocked =
      crawl.blockedByRobots.includes(page.url) ||
      crawl.blockedByRobots.includes(page.finalUrl);
    if (blocked) return fail("URL is disallowed by robots.txt");
    return pass("URL is allowed by robots.txt");
  },
});

export const indexableInSitemapConflictRule = defineRule({
  id: "crawl-noindex-in-sitemap",
  category: "crawlability",
  severity: "high",
  weight: 10,
  title: "Noindex pages should not be in sitemap",
  description: "Sitemap should only list indexable URLs",
  recommendation: "Remove noindex URLs from the sitemap.",
  requiresCrawl: true,
  check: async ({ page, crawl, $ }) => {
    if (!crawl || crawl.sitemapUrls.length === 0) return unmeasured("No sitemap");
    const inSitemap = crawl.sitemapUrls.map(normalizeUrl).includes(normalizeUrl(page.finalUrl));
    if (!inSitemap) return pass("Page not in sitemap");
    const meta = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
    if (/\bnoindex\b/.test(meta)) {
      return fail("noindex page is listed in the sitemap", { url: page.finalUrl });
    }
    return pass("Sitemap page is not noindex");
  },
});

export const internalLinkingRule = defineRule({
  id: "crawl-internal-links-present",
  category: "crawlability",
  severity: "medium",
  weight: 6,
  title: "Internal links present",
  description: "Page should expose internal links for crawl discovery",
  recommendation: "Add contextual internal links in body content.",
  check: async ({ page }) => {
    const internal = page.links.filter((l) => l.isInternal);
    if (internal.length === 0) return warn("No internal links found on page");
    return pass(`${internal.length} internal link(s)`, { count: internal.length });
  },
});

export const canonicalChainRule = defineRule({
  id: "crawl-canonical-chain",
  category: "crawlability",
  severity: "high",
  weight: 10,
  title: "Canonical chain length",
  description: "Canonical should resolve in one hop within the crawl",
  recommendation: "Point canonicals directly at the final preferred URL.",
  requiresCrawl: true,
  check: async ({ page, crawl }) => {
    if (!crawl || !page.canonical) return unmeasured("Needs crawl + canonical");
    const byUrl = new Map(crawl.pages.map((p) => [normalizeUrl(p.finalUrl), p]));
    let hops = 0;
    let current = normalizeUrl(page.finalUrl);
    const seen = new Set<string>();
    while (hops < 6) {
      const node = byUrl.get(current);
      if (!node?.canonical) break;
      let next: string;
      try {
        next = normalizeUrl(new URL(node.canonical, node.finalUrl).href);
      } catch {
        break;
      }
      if (next === current) break;
      if (seen.has(next)) return fail("Canonical chain loops", { hops });
      seen.add(next);
      current = next;
      hops++;
    }
    if (hops >= 2) return warn(`Canonical chain has ${hops} hops`, { hops });
    return pass("Canonical chain is short");
  },
});

const CRAWLABILITY_RULES = [
  orphanPagesRule,
  clickDepthRule,
  sitemapCoverageRule,
  sitemapNon200Rule,
  robotsBlockedRule,
  indexableInSitemapConflictRule,
  internalLinkingRule,
  canonicalChainRule,
];

export function registerCrawlabilityRules(): void {
  for (const rule of CRAWLABILITY_RULES) registerRule(rule);
}

export { CRAWLABILITY_RULES };
