import { fetchPage } from "@/audit/crawler/fetcher";
import { buildInboundMap, normalizeUrl } from "@/audit/crawler/link-graph";
import { originOf, parseHtmlPage } from "@/audit/crawler/page-parse";
import { fetchRobotsTxt } from "@/audit/crawler/robots";
import { discoverSitemapUrls } from "@/audit/crawler/sitemap";
import type { AuditConfig, CrawledPage, CrawlResult } from "@/audit/types";

export type CrawlOptions = Pick<
  AuditConfig,
  "maxPages" | "concurrency" | "respectRobots" | "timeoutMs"
> & {
  startUrl: string;
};

/**
 * Multi-page BFS crawler. Quick audits typically use maxPages=1.
 * Playwright enrichment happens in the audit runner when config.render.
 */
export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const startUrl = normalizeUrl(options.startUrl);
  const origin = originOf(startUrl);
  const robots = options.respectRobots
    ? await fetchRobotsTxt(origin, options.timeoutMs)
    : null;

  const sitemapUrls = await discoverSitemapUrls(
    origin,
    robots?.sitemaps ?? [],
    options.timeoutMs,
  );

  const blockedByRobots: string[] = [];
  const pages: CrawledPage[] = [];
  const depthMap = new Map<string, number>();
  const seen = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];

  async function visit(url: string, depth: number): Promise<void> {
    const key = normalizeUrl(url);
    if (seen.has(key) || pages.length >= options.maxPages) return;
    seen.add(key);

    let path = "/";
    try {
      path = new URL(url).pathname;
    } catch {
      return;
    }

    if (robots && !robots.isAllowed(path)) {
      blockedByRobots.push(url);
      return;
    }

    try {
      const { response, html } = await fetchPage(url, options.timeoutMs);
      const page = parseHtmlPage({
        url,
        finalUrl: response.finalUrl,
        status: response.status,
        html,
        depth,
        headers: response.headers,
        redirectChain: response.redirectChain,
        timingMs: response.timingMs,
      });
      pages.push(page);
      depthMap.set(normalizeUrl(page.finalUrl), depth);

      if (depth + 1 >= 20) return;
      for (const link of page.links) {
        if (!link.isInternal) continue;
        if (originOf(link.href) !== origin) continue;
        const next = normalizeUrl(link.href);
        if (seen.has(next)) continue;
        if (pages.length + queue.length >= options.maxPages) break;
        queue.push({ url: next, depth: depth + 1 });
      }
    } catch (err) {
      pages.push({
        url,
        finalUrl: url,
        status: 0,
        rawHtml: "",
        headers: {},
        redirectChain: [],
        timingMs: 0,
        title: null,
        metaDescription: null,
        canonical: null,
        h1s: [],
        links: [],
        depth,
        wordCount: 0,
        fetchedAt: new Date(),
        error: err instanceof Error ? err.message : "fetch failed",
      });
      depthMap.set(key, depth);
    }
  }

  // Seed queue with a few sitemap URLs for discovery (full mode).
  if (options.maxPages > 1) {
    for (const sUrl of sitemapUrls.slice(0, Math.min(20, options.maxPages))) {
      if (originOf(sUrl) !== origin) continue;
      queue.push({ url: sUrl, depth: 1 });
    }
  }

  while (queue.length > 0 && pages.length < options.maxPages) {
    const batch = queue.splice(0, options.concurrency);
    await Promise.all(batch.map((item) => visit(item.url, item.depth)));
  }

  return {
    startUrl,
    pages,
    inbound: buildInboundMap(pages),
    depth: depthMap,
    robotsTxt: robots?.raw ?? null,
    sitemapUrls,
    blockedByRobots,
  };
}
