/**
 * Internal-link graph analyser.
 *
 * 1. Crawl the site (reuse sitemap-generator's BFS crawler).
 * 2. For each HTML page, extract its in-page text + outbound internal links.
 * 3. Build a directed graph of internal links.
 * 4. Compute TF-IDF vectors for each page's text.
 * 5. Identify:
 *    - Orphan pages (zero inbound links)
 *    - Over-linked pages (many outbound, few inbound)
 *    - For each orphan, propose 3 best source pages by cosine similarity.
 *
 * No external services. Pure in-memory math, capped at 200 pages.
 */

import { crawlSite } from "./sitemap-generator";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type LinkAnalysis = {
  pages: AnalysedPage[];
  orphans: AnalysedPage[];
  hubs: AnalysedPage[];
  /** For each orphan: top-3 source pages by content similarity. */
  suggestions: {
    orphanUrl: string;
    candidates: {
      url: string;
      score: number;
      titleSnippet: string;
      /**
       * The candidate's markup, truncated.
       *
       * Carried through so a caller choosing anchor text doesn't have
       * to fetch the page a second time — the crawl above already has
       * it, and re-fetching a handful of pages we just downloaded is
       * both slower and a second place to get URL handling wrong.
       *
       * Only on suggestion candidates, never on every crawled page:
       * this is capped at three per orphan, so the memory stays
       * bounded on the small VPS this is meant to run on.
       */
      html: string;
    }[];
  }[];
  totalLinks: number;
};

export type AnalysedPage = {
  url: string;
  title: string;
  inbound: number;
  outbound: number;
  wordCount: number;
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "of",
  "for", "with", "by", "from", "this", "that", "these", "those", "is",
  "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might",
  "you", "your", "yours", "we", "our", "us", "they", "their", "them",
  "i", "me", "my", "he", "she", "it", "its", "as", "if", "so", "not",
  "no", "yes", "can", "all", "any", "some", "very", "too", "more",
  "most", "much", "many", "such", "than", "then", "what", "which",
  "who", "whom", "where", "when", "why", "how", "about", "after",
  "before", "during", "while", "into", "out", "up", "down", "over",
  "under", "again", "further", "here", "there", "now", "just", "only",
  "also", "each", "other", "same", "own", "those", "us", "etc",
]);

/**
 * URLs listed in the site's sitemap, for use as crawl seeds.
 *
 * Without these, orphan detection here could never work — and didn't.
 * A link-following crawl only reaches pages something links to, so a
 * page with no inbound links was never fetched, never appeared in
 * `pages`, and therefore never appeared in `orphans` either. The list
 * was reliably empty, and the tool built on it reported "no orphan
 * pages" on every site it was ever pointed at.
 *
 * Best-effort: a site with no sitemap simply falls back to the old
 * link-following behaviour, which is no worse than before.
 */
async function sitemapUrls(origin: string): Promise<string[]> {
  const candidates = [`${origin}/sitemap.xml`];

  // robots.txt is where a site declares a sitemap somewhere unusual —
  // WordPress with Yoast, for instance, uses /sitemap_index.xml.
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const txt = (await res.text()).slice(0, 100_000);
      for (const line of txt.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) {
        candidates.push(line[1]);
      }
    }
  } catch {
    // No robots.txt is normal.
  }

  const found = new Set<string>();
  for (const sm of candidates.slice(0, 5)) {
    try {
      const res = await fetch(sm, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const xml = (await res.text()).slice(0, 2_000_000);
      for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        found.add(m[1]);
        // A sitemap index points at more sitemaps. One level deep is
        // enough for the sites this tool is for, and stops a malformed
        // or hostile sitemap turning into an unbounded fetch loop.
        if (found.size > 500) break;
      }
    } catch {
      continue;
    }
  }
  return [...found];
}

export async function analyseInternalLinks(opts: {
  startUrl: string;
  maxPages?: number;
}): Promise<LinkAnalysis> {
  const maxPages = Math.min(opts.maxPages ?? 150, 200);

  let origin = "";
  try {
    origin = new URL(opts.startUrl).origin;
  } catch {
    // Handled by the host check below.
  }
  const seedUrls = origin ? await sitemapUrls(origin) : [];

  const { pages: crawled } = await crawlSite({
    startUrl: opts.startUrl,
    maxPages,
    maxDepth: 4,
    respectRobots: true,
    // Without the sitemap as seeds, an orphan is never fetched and so
    // can never be reported as one.
    seedUrls,
  });

  let host = "";
  try {
    host = new URL(opts.startUrl).hostname;
  } catch {
    return {
      pages: [],
      orphans: [],
      hubs: [],
      suggestions: [],
      totalLinks: 0,
    };
  }

  // Fetch each page's HTML to get title + text + outbound links
  const pageData = new Map<
    string,
    { title: string; text: string; html: string; outboundUrls: string[] }
  >();
  for (let i = 0; i < crawled.length; i += 6) {
    const batch = crawled.slice(i, i + 6).filter((p) => p.isHtml);
    const results = await Promise.allSettled(
      batch.map((p) => fetchPageContent(p.url, host)),
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled" && r.value) {
        pageData.set(batch[j].url, r.value);
      }
    }
  }

  if (pageData.size === 0) {
    return {
      pages: [],
      orphans: [],
      hubs: [],
      suggestions: [],
      totalLinks: 0,
    };
  }

  // Build inbound/outbound counts
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  let totalLinks = 0;
  for (const [src, d] of pageData) {
    outbound.set(src, d.outboundUrls.length);
    for (const dst of d.outboundUrls) {
      if (pageData.has(dst)) {
        inbound.set(dst, (inbound.get(dst) ?? 0) + 1);
        totalLinks++;
      }
    }
  }

  const pages: AnalysedPage[] = Array.from(pageData.entries()).map(
    ([url, d]) => ({
      url,
      title: d.title,
      inbound: inbound.get(url) ?? 0,
      outbound: outbound.get(url) ?? 0,
      wordCount: d.text.split(/\s+/).filter(Boolean).length,
    }),
  );

  const orphans = pages
    .filter((p) => p.inbound === 0 && p.url !== opts.startUrl)
    .sort((a, b) => b.wordCount - a.wordCount);
  const hubs = pages
    .filter((p) => p.inbound >= 5)
    .sort((a, b) => b.inbound - a.inbound)
    .slice(0, 20);

  // TF-IDF for orphan suggestion engine
  const docs = new Map<string, Map<string, number>>();
  for (const [url, d] of pageData) {
    docs.set(url, termFrequency(d.text));
  }
  const idf = computeIdf(docs);

  const suggestions = orphans.slice(0, 25).map((orphan) => {
    const orphanVec = tfidfVector(docs.get(orphan.url) ?? new Map(), idf);
    const candidates: {
      url: string;
      score: number;
      titleSnippet: string;
      html: string;
    }[] = [];
    for (const [url, tf] of docs) {
      if (url === orphan.url) continue;
      const vec = tfidfVector(tf, idf);
      const score = cosineSimilarity(orphanVec, vec);
      candidates.push({
        url,
        score,
        titleSnippet: pageData.get(url)?.title.slice(0, 80) ?? "",
        html: pageData.get(url)?.html ?? "",
      });
    }
    candidates.sort((a, b) => b.score - a.score);
    return {
      orphanUrl: orphan.url,
      candidates: candidates.slice(0, 3),
    };
  });

  return {
    pages,
    orphans,
    hubs,
    suggestions,
    totalLinks,
  };
}

async function fetchPageContent(
  url: string,
  host: string,
): Promise<{
  title: string;
  text: string;
  html: string;
  outboundUrls: string[];
} | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) return null;
    const html = (await res.text()).slice(0, 800_000);

    const title =
      (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1] : html;
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const outboundUrls: string[] = [];
    const linkRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi;
    for (const m of html.matchAll(linkRe)) {
      const href = m[1];
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:")
      )
        continue;
      try {
        const abs = new URL(href, url).toString();
        const u = new URL(abs);
        if (u.hostname === host || u.hostname.endsWith(`.${host}`)) {
          outboundUrls.push(abs.split("#")[0]);
        }
      } catch {
        continue;
      }
    }

    // Truncated: enough to find an anchor phrase in an article, far
    // less than holding whole pages for a 60-page crawl in memory.
    return {
      title: title.slice(0, 200),
      text,
      html: html.slice(0, 200_000),
      outboundUrls,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function termFrequency(text: string): Map<string, number> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

function computeIdf(docs: Map<string, Map<string, number>>): Map<string, number> {
  const totalDocs = docs.size;
  const docFreq = new Map<string, number>();
  for (const tf of docs.values()) {
    for (const term of tf.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log(totalDocs / (1 + df)) + 1);
  }
  return idf;
}

function tfidfVector(
  tf: Map<string, number>,
  idf: Map<string, number>,
): Map<string, number> {
  const vec = new Map<string, number>();
  let totalTerms = 0;
  for (const c of tf.values()) totalTerms += c;
  if (totalTerms === 0) return vec;
  for (const [term, count] of tf) {
    const w = (count / totalTerms) * (idf.get(term) ?? 1);
    if (w > 0) vec.set(term, w);
  }
  return vec;
}

function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  // iterate the smaller map for speed
  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, va] of smaller) {
    const vb = larger.get(t);
    if (vb !== undefined) dot += va * vb;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
