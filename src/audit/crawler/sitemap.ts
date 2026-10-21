/**
 * Discover sitemap URLs from robots.txt Sitemap: lines and /sitemap.xml.
 */

export async function discoverSitemapUrls(
  origin: string,
  robotsSitemaps: string[],
  timeoutMs: number,
): Promise<string[]> {
  const candidates = [
    ...robotsSitemaps,
    new URL("/sitemap.xml", origin).href,
    new URL("/sitemap_index.xml", origin).href,
  ];
  const found = new Set<string>();
  const visited = new Set<string>();

  for (const candidate of candidates) {
    await collectFromSitemap(candidate, found, visited, timeoutMs, 0);
  }
  return Array.from(found);
}

async function collectFromSitemap(
  sitemapUrl: string,
  found: Set<string>,
  visited: Set<string>,
  timeoutMs: number,
  depth: number,
): Promise<void> {
  if (depth > 3 || visited.has(sitemapUrl) || found.size > 5000) return;
  visited.add(sitemapUrl);

  let xml: string;
  try {
    const res = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "SeoToolAuditBot/1.0" },
    });
    if (!res.ok) return;
    xml = await res.text();
  } catch {
    return;
  }

  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  if (isIndex) {
    for (const loc of extractLocs(xml)) {
      await collectFromSitemap(loc, found, visited, timeoutMs, depth + 1);
    }
    return;
  }

  for (const loc of extractLocs(xml)) {
    found.add(loc);
    if (found.size > 5000) return;
  }
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const loc = m[1]?.trim();
    if (loc) out.push(loc);
  }
  return out;
}
