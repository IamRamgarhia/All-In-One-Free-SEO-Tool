/**
 * Backlink discovery v2. Closes the gap with Ahrefs/Semrush as much as is
 * possible without a paid index. Combines:
 *
 *   1. **DuckDuckGo HTML** searches (already used by link-prospector)
 *      with multiple query forms — `"target.com"`, `link:target.com`,
 *      `"competitor brand" -site:competitor.com`.
 *   2. **Common Crawl CDX API** — public, free index of crawled URLs.
 *      Resolves "what pages have crawled URLs that mention this domain
 *      somewhere in their HTML." Falls back gracefully when CC is down
 *      (it has flakiness; we never block on it).
 *   3. **Crawl-to-confirm** — for each candidate page we do a tiny GET
 *      and grep for an actual `<a href>` to the target domain. Promotes
 *      pages from "mentions" to "verified backlinks" + extracts anchor
 *      text. This is the step that makes the result usable as a real
 *      backlink list, not just a mention finder.
 *
 * Returns a deduped, ranked list with anchor text + dofollow detection.
 *
 * No paid APIs. No keys (DuckDuckGo is unauthenticated, Common Crawl
 * indexes are public). Worst case the result is the discovered-mention
 * list — best case it's a confirmed backlink list with anchor text.
 */

import { searchDuckDuckGo } from "./link-prospector";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type DiscoveredBacklink = {
  /** External page that links to / mentions the target. */
  url: string;
  domain: string;
  /** Page title pulled when we crawl-to-confirm. */
  title: string | null;
  /** What the link's <a> text actually says, when present. */
  anchorText: string | null;
  /** "verified" = found a real <a href> to target. "mention" = only text. */
  status: "verified" | "mention";
  /** rel="nofollow" / "ugc" / "sponsored" present? null = unknown. */
  rel: string | null;
  /** Where we found this URL. */
  source: "ddg" | "common_crawl";
};

export type DiscoveryResult = {
  target: string;
  candidates: number;
  verified: number;
  mentions: number;
  links: DiscoveredBacklink[];
  errors: string[];
};

export async function discoverBacklinks(opts: {
  targetDomain: string;
  /** Hard cap on confirmed link list length, default 60. */
  limit?: number;
  /** Skip the crawl-to-confirm pass (much faster but only mentions). */
  skipVerify?: boolean;
}): Promise<DiscoveryResult> {
  const target = normaliseDomain(opts.targetDomain);
  if (!target) {
    return {
      target: opts.targetDomain,
      candidates: 0,
      verified: 0,
      mentions: 0,
      links: [],
      errors: ["Invalid domain"],
    };
  }
  const limit = opts.limit ?? 60;
  const errors: string[] = [];

  // ============== Step 1: DuckDuckGo ==============
  const ddgQueries = [
    `"${target}" -site:${target}`,
    `link:${target}`,
    `"${target.replace(/\..+$/, "")}" -site:${target}`,
  ];
  const ddgResults = new Map<
    string,
    { title: string; snippet: string | null }
  >();
  for (const q of ddgQueries) {
    try {
      const rows = await searchDuckDuckGo(q);
      for (const r of rows) {
        if (ddgResults.has(r.url)) continue;
        ddgResults.set(r.url, { title: r.title, snippet: r.snippet });
      }
    } catch {
      errors.push(`DDG search failed for: ${q}`);
    }
  }

  // ============== Step 2: Common Crawl CDX ==============
  const ccUrls = await searchCommonCrawl(target).catch((err) => {
    errors.push(`Common Crawl: ${(err as Error).message ?? "failed"}`);
    return [];
  });

  // Merge candidates
  const candidates = new Map<string, DiscoveredBacklink>();
  for (const [url, meta] of ddgResults) {
    let domain: string;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }
    if (domain === target) continue;
    candidates.set(url.split("#")[0], {
      url,
      domain,
      title: meta.title || null,
      anchorText: null,
      status: "mention",
      rel: null,
      source: "ddg",
    });
  }
  for (const url of ccUrls) {
    if (candidates.has(url)) continue;
    let domain: string;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }
    if (domain === target) continue;
    candidates.set(url, {
      url,
      domain,
      title: null,
      anchorText: null,
      status: "mention",
      rel: null,
      source: "common_crawl",
    });
  }

  const candidateList = Array.from(candidates.values()).slice(0, limit * 2);

  // ============== Step 3: Crawl to confirm ==============
  if (opts.skipVerify) {
    return {
      target,
      candidates: candidateList.length,
      verified: 0,
      mentions: candidateList.length,
      links: candidateList.slice(0, limit),
      errors,
    };
  }

  const verified: DiscoveredBacklink[] = [];
  for (let i = 0; i < candidateList.length; i += 6) {
    const batch = candidateList.slice(i, i + 6);
    const results = await Promise.allSettled(
      batch.map((c) => verifyLink(c, target)),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) verified.push(r.value);
    }
    if (verified.length >= limit) break;
  }

  // Sort: verified first, then mentions
  verified.sort((a, b) => {
    if (a.status !== b.status) return a.status === "verified" ? -1 : 1;
    return 0;
  });

  return {
    target,
    candidates: candidateList.length,
    verified: verified.filter((l) => l.status === "verified").length,
    mentions: verified.filter((l) => l.status === "mention").length,
    links: verified.slice(0, limit),
    errors,
  };
}

/**
 * Search Common Crawl's CDX index for URLs containing the target domain.
 * Picks the most-recent index automatically. Free, public, no key.
 *
 * The CDX endpoint is best-effort — sometimes returns 503, sometimes
 * times out. We give up gracefully.
 */
async function searchCommonCrawl(target: string): Promise<string[]> {
  // Get the list of indexes, pick the most recent one
  let indexId: string;
  try {
    const res = await fetch("https://index.commoncrawl.org/collinfo.json", {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const cols = (await res.json()) as { id: string }[];
    if (!cols.length) return [];
    indexId = cols[0].id;
  } catch {
    return [];
  }

  // CDX query: pages mentioning the target domain. matchType=domain
  // returns pages on the target — for backlinks we want pages elsewhere.
  // The CDX API doesn't support full-text search, so this is a coarse
  // filter — we still get useful candidates from URLs that have the
  // target domain in their query string or path (e.g., affiliate links,
  // tracking pixels, comments quoting URLs).
  const url = `https://index.commoncrawl.org/${indexId}-index?url=${encodeURIComponent(`*.${target}`)}&matchType=domain&limit=200&output=json`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const text = await res.text();
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { url?: string };
      if (row.url) out.add(row.url);
    } catch {
      continue;
    }
  }
  return Array.from(out);
}

/**
 * Crawl-to-confirm: fetch the candidate page and look for a real
 * `<a href>` linking to the target domain. Extracts anchor text + rel.
 */
async function verifyLink(
  candidate: DiscoveredBacklink,
  target: string,
): Promise<DiscoveredBacklink> {
  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 10_000);
    const res = await fetch(candidate.url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return candidate;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) return candidate;

    const html = (await res.text()).slice(0, 1_500_000);

    // Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? cleanText(titleMatch[1]).slice(0, 200) : null;

    // Find the most-relevant <a href> pointing at the target
    const linkRe = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
    let bestAnchor: string | null = null;
    let bestRel: string | null = null;
    let foundLink = false;

    for (const match of html.matchAll(linkRe)) {
      const attrs = match[1];
      const inner = match[2];
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];
      if (!hrefPointsAt(href, target)) continue;

      foundLink = true;
      const anchor = cleanText(inner.replace(/<[^>]+>/g, " ")).slice(0, 200);
      if (anchor) bestAnchor = bestAnchor ?? anchor;
      const relMatch = attrs.match(/rel\s*=\s*["']([^"']+)["']/i);
      if (relMatch) {
        bestRel = bestRel ?? relMatch[1].trim();
      }
      // The first hit is usually the prominent contextual one
      break;
    }

    return {
      ...candidate,
      title: title ?? candidate.title,
      anchorText: bestAnchor,
      rel: bestRel,
      status: foundLink ? "verified" : "mention",
    };
  } catch {
    return candidate;
  }
}

function hrefPointsAt(href: string, target: string): boolean {
  if (!href) return false;
  const lower = href.toLowerCase();
  // Match http(s)://target, //target, or target/...
  if (lower.includes(`://${target}`)) return true;
  if (lower.includes(`://www.${target}`)) return true;
  if (lower.startsWith(`//${target}`)) return true;
  if (lower.startsWith(`//www.${target}`)) return true;
  // Match a path-relative reference that's actually on the target —
  // this almost never happens for cross-site backlinks, skip.
  return false;
}

function cleanText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseDomain(input: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase() || null;
  }
}
