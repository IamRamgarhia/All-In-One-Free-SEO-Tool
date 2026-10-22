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

export const sitemapOrphanUrlsRule = defineRule({
  id: "crawl-sitemap-orphan-urls",
  category: "crawlability",
  severity: "medium",
  weight: 7,
  title: "Sitemap URLs discovered by crawl",
  description: "Sitemap entries should be reachable from internal links when crawled",
  recommendation: "Link important sitemap URLs from navigation or content.",
  requiresCrawl: true,
  check: async ({ crawl }) => {
    if (!crawl || crawl.pages.length < 2 || crawl.sitemapUrls.length === 0) {
      return unmeasured("Needs multi-page crawl + sitemap");
    }
    const crawled = new Set(crawl.pages.map((p) => normalizeUrl(p.finalUrl)));
    const missing = crawl.sitemapUrls
      .map(normalizeUrl)
      .filter((u) => !crawled.has(u))
      .slice(0, 20);
    // Only warn when we crawled enough that absence is meaningful.
    if (crawl.pages.length >= 5 && missing.length > 10) {
      return warn(
        `${missing.length}+ sitemap URL(s) not reached in this crawl sample`,
        { samples: missing.slice(0, 8) },
      );
    }
    return pass("Sitemap coverage vs crawl sample looks reasonable");
  },
});

export const isolatedUrlRule = defineRule({
  id: "crawl-isolated-url",
  category: "crawlability",
  severity: "medium",
  weight: 6,
  title: "No isolated crawled URLs",
  description: "Pages with neither inbound nor outbound internal links are isolated",
  recommendation: "Connect isolated pages into the site graph.",
  requiresCrawl: true,
  check: async ({ page, crawl }) => {
    if (!crawl || crawl.pages.length < 2) return unmeasured("Needs multi-page crawl");
    const key = normalizeUrl(page.finalUrl);
    const inbound = (crawl.inbound.get(key) ?? []).length;
    const outbound = page.links.filter((l) => l.isInternal).length;
    if (inbound === 0 && outbound === 0 && key !== normalizeUrl(crawl.startUrl)) {
      return warn("Page is isolated (no inbound or outbound internal links)");
    }
    return pass("Page is connected to the site graph");
  },
});

export const paginationRelRule = defineRule({
  id: "crawl-pagination-rel",
  category: "crawlability",
  severity: "low",
  weight: 4,
  title: "Pagination rel signals",
  description: "Paginated series often expose rel=next/prev",
  recommendation: "Add rel=next/prev (or a clear paginated canonical strategy).",
  check: async ({ $, page }) => {
    const looksPaginated =
      /[?&]page=\d+/i.test(page.finalUrl) ||
      /\/page\/\d+/i.test(page.finalUrl) ||
      /[?&]p=\d+/i.test(page.finalUrl);
    if (!looksPaginated) return pass("Not a paginated URL pattern");
    const hasNext = $('link[rel="next"]').length > 0;
    const hasPrev = $('link[rel="prev"]').length > 0;
    if (!hasNext && !hasPrev) {
      return warn("Paginated URL without rel=next/prev");
    }
    return pass("Pagination rel link(s) present");
  },
});

export const hreflangPresentRule = defineRule({
  id: "crawl-hreflang-basic",
  category: "crawlability",
  severity: "low",
  weight: 4,
  title: "Hreflang tags are well-formed when present",
  description: "Basic validation of hreflang link tags on the page",
  recommendation: "Ensure hreflang values are valid language codes and hrefs are absolute.",
  check: async ({ $ }) => {
    const tags: Array<{ lang: string; href: string }> = [];
    $('link[rel="alternate"][hreflang]').each((_, el) => {
      tags.push({
        lang: ($(el).attr("hreflang") ?? "").trim(),
        href: ($(el).attr("href") ?? "").trim(),
      });
    });
    if (tags.length === 0) return pass("No hreflang tags (OK for monolingual sites)");
    const bad = tags.filter(
      (t) => !t.lang || !t.href || (!t.href.startsWith("http") && !t.href.startsWith("/")),
    );
    if (bad.length > 0) {
      return warn(`${bad.length} malformed hreflang tag(s)`, { samples: bad.slice(0, 5) });
    }
    return pass(`${tags.length} hreflang tag(s) look well-formed`);
  },
});

export const sitemapDomainRule = defineRule({
  id: "crawl-sitemap-domain",
  category: "crawlability",
  severity: "high",
  weight: 8,
  title: "Sitemap URLs match site host",
  description: "Sitemap should not list off-host URLs for this property",
  recommendation: "Keep sitemap entries on the same registrable host.",
  requiresCrawl: true,
  check: async ({ crawl, page }) => {
    if (!crawl || crawl.sitemapUrls.length === 0) return unmeasured("No sitemap");
    let host: string;
    try {
      host = new URL(page.finalUrl).hostname.replace(/^www\./, "");
    } catch {
      return unmeasured("Bad page URL");
    }
    const foreign = crawl.sitemapUrls.filter((u) => {
      try {
        return new URL(u).hostname.replace(/^www\./, "") !== host;
      } catch {
        return true;
      }
    });
    if (foreign.length > 0) {
      return fail(`${foreign.length} sitemap URL(s) on another host`, {
        samples: foreign.slice(0, 5),
      });
    }
    return pass("Sitemap URLs match site host");
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
  sitemapOrphanUrlsRule,
  isolatedUrlRule,
  paginationRelRule,
  hreflangPresentRule,
  sitemapDomainRule,
];

export function registerCrawlabilityRules(): void {
  for (const rule of CRAWLABILITY_RULES) registerRule(rule);
}

export { CRAWLABILITY_RULES };
