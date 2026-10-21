import { extract } from "@/lib/geo-audit/lib/extract";
import {
  loadRobots,
  selfAllows,
  type RobotsFile,
} from "@/lib/geo-audit/lib/robots";
import { geoFetch, type FetchResult } from "@/lib/geo-audit/fetch";
import type { GeoPage } from "@/lib/geo-audit/scoring/technical";
import { hostOf, isCrawlable, normalizeUrl } from "@/lib/geo-audit/url-utils";

export type GeoCrawlResult = {
  startUrl: string;
  pages: GeoPage[];
  robots: RobotsFile | null;
  failures: Array<{ url: string; reason: string }>;
};

async function fetchPage(
  url: string,
  signal: AbortSignal | undefined,
  failures: Array<{ url: string; reason: string }>,
): Promise<GeoPage | null> {
  try {
    const result = await geoFetch(url, { signal, timeoutMs: 30_000 });
    let doc = null;
    if (result.ok) {
      doc = extract(result.body, result.finalUrl);
    }
    return { url, result, doc };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "fetch failed";
    failures.push({ url, reason });
    return null;
  }
}

export async function crawlGeoSite(
  startUrl: string,
  opts: { maxPages: number; signal?: AbortSignal },
): Promise<GeoCrawlResult> {
  const maxPages = Math.max(1, opts.maxPages);
  const robots = await loadRobots(startUrl, { signal: opts.signal });
  const startHost = hostOf(startUrl);
  const seen = new Set<string>([normalizeUrl(startUrl)]);
  const landed = new Set<string>();
  const pages: GeoPage[] = [];
  const failures: Array<{ url: string; reason: string }> = [];

  let frontier: string[] = [startUrl];

  while (frontier.length && pages.length < maxPages) {
    const level = frontier.splice(0, maxPages - pages.length);
    const discovered: string[] = [];

    for (const url of level) {
      if (opts.signal?.aborted) break;
      const path = new URL(url).pathname || "/";
      if (robots && !selfAllows(robots, path)) {
        continue;
      }

      const page = await fetchPage(url, opts.signal, failures);
      if (!page) continue;

      const final = normalizeUrl(page.result?.finalUrl ?? url);
      if (landed.has(final)) continue;
      landed.add(final);
      seen.add(final);
      pages.push(page);

      if (!page.doc) continue;
      for (const link of page.doc.internalLinks) {
        if (!isCrawlable(link)) continue;
        if (hostOf(link) !== startHost) continue;
        const norm = normalizeUrl(link);
        if (seen.has(norm)) continue;
        const linkPath = new URL(link).pathname || "/";
        if (robots && !selfAllows(robots, linkPath)) continue;
        seen.add(norm);
        discovered.push(link);
      }
    }

    discovered.sort((a, b) => normalizeUrl(a).localeCompare(normalizeUrl(b)));
    frontier.push(...discovered);
  }

  return { startUrl, pages, robots, failures };
}

export type { FetchResult };
