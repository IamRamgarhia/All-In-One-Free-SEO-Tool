import type { CrawledPage } from "@/audit/types";
import { originOf } from "@/audit/crawler/page-parse";

export function buildInboundMap(
  pages: CrawledPage[],
): Map<string, string[]> {
  const inbound = new Map<string, string[]>();
  const known = new Set(pages.map((p) => normalizeUrl(p.finalUrl)));

  for (const page of pages) {
    for (const link of page.links) {
      if (!link.isInternal) continue;
      const target = normalizeUrl(link.href);
      if (!known.has(target)) continue;
      const list = inbound.get(target) ?? [];
      list.push(page.finalUrl);
      inbound.set(target, list);
    }
  }
  return inbound;
}

export function orphanPages(
  pages: CrawledPage[],
  inbound: Map<string, string[]>,
  startUrl: string,
): string[] {
  const start = normalizeUrl(startUrl);
  return pages
    .map((p) => p.finalUrl)
    .filter((url) => {
      const n = normalizeUrl(url);
      if (n === start) return false;
      return (inbound.get(n) ?? []).length === 0;
    });
}

export function pagesBeyondDepth(
  pages: CrawledPage[],
  maxDepth: number,
): string[] {
  return pages.filter((p) => p.depth > maxDepth).map((p) => p.finalUrl);
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Drop trailing slash except origin root
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return url;
  }
}

export function sameHost(a: string, b: string): boolean {
  return originOf(a) === originOf(b);
}
