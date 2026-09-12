/**
 * Competitor playbook reverse-engineer. Given a competitor URL we:
 *   1. Detect their tech stack
 *   2. Crawl up to N pages with the existing sitemap crawler
 *   3. For each page, extract title + meta + H1 + word count
 *   4. Cluster URL patterns to find their content silos
 *   5. Synthesise "what they do you don't" via the AI helper
 *
 * All free — no paid APIs, no SEMrush. Limited to publicly crawlable
 * pages, which is the same fundamental limit any tool faces.
 */

import { detectTechStack, type DetectionResult } from "./tech-detect";
import { crawlSite } from "./sitemap-generator";
import { callAI, lastAiFailure } from "./ai-call";
import { searchDuckDuckGo } from "./link-prospector";
import { citationsForCountry, type CitationEntry } from "./citations-data";

export type CompetitorPage = {
  url: string;
  title: string;
  description: string;
  h1: string;
  wordCount: number;
  pathSegment: string;
  /** First non-trivial path segment — used to group into silos. */
  silo: string;
};

export type CompetitorBacklink = {
  url: string;
  domain: string;
  title: string;
  snippet: string | null;
};

export type CompetitorCitationStatus = {
  citation: CitationEntry;
  listed: boolean | "unknown";
};

export type RankingSignals = {
  schemaTypes: string[];
  avgWordCount: number;
  longFormCount: number;
  avgInternalLinks: number;
  https: boolean;
  hasMetaDescription: boolean;
  usesCanonical: boolean;
  ogTagCount: number;
};

export type CompetitorPlaybook = {
  competitorUrl: string;
  techStack: DetectionResult;
  pageCount: number;
  pages: CompetitorPage[];
  silos: { silo: string; count: number; sample: string[] }[];
  synthesis: string | null;
  /** When the synthesis is null because no AI provider is configured. */
  synthesisError?: string;
  backlinks: CompetitorBacklink[];
  citationStatus: CompetitorCitationStatus[];
  signals: RankingSignals;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

/**
 * Run the full competitor analysis. Caps at 60 pages so a single click
 * doesn't melt your laptop or the competitor's server.
 */
export async function reverseEngineerCompetitor(opts: {
  competitorUrl: string;
  myUrl?: string;
  maxPages?: number;
  /** ISO country code — drives which citation directories we check. */
  country?: string;
}): Promise<CompetitorPlaybook> {
  const maxPages = opts.maxPages ?? 60;
  const country = (opts.country ?? "US").toUpperCase();

  let competitorDomain = "";
  try {
    competitorDomain = new URL(opts.competitorUrl).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    competitorDomain = opts.competitorUrl;
  }

  const [techStack, { pages: crawled }, homepageHtml, backlinks] =
    await Promise.all([
      detectTechStack(opts.competitorUrl).catch(
        (): DetectionResult => ({
          url: opts.competitorUrl,
          technologies: [],
          status: 0,
          finalUrl: opts.competitorUrl,
          fetchedAt: new Date(),
        }),
      ),
      crawlSite({
        startUrl: opts.competitorUrl,
        maxPages,
        maxDepth: 3,
        respectRobots: true,
      }),
      fetchHomepage(opts.competitorUrl).catch(() => ""),
      findCompetitorBacklinks(opts.competitorUrl, competitorDomain).catch(
        () => [],
      ),
    ]);

  // Extract metadata from each crawled URL.
  const pages: CompetitorPage[] = [];
  for (let i = 0; i < crawled.length; i += 6) {
    const batch = crawled.slice(i, i + 6);
    const results = await Promise.allSettled(
      batch.map((p) => extractMetadata(p.url)),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) pages.push(r.value);
    }
  }

  const signals = analyseRankingSignals(homepageHtml, opts.competitorUrl, pages);
  const citationStatus = await checkCitations(competitorDomain, country);

  const silos = aggregateSilos(pages);
  const synthesis = await synthesiseGap(
    opts,
    pages,
    silos,
    signals,
    backlinks,
    citationStatus,
  );

  return {
    competitorUrl: opts.competitorUrl,
    techStack,
    pageCount: pages.length,
    pages,
    silos,
    synthesis: synthesis.text,
    synthesisError: synthesis.error,
    backlinks,
    citationStatus,
    signals,
  };
}

/** Fetch homepage HTML once so multiple analysers can read from it. */
async function fetchHomepage(url: string): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) return "";
    return (await res.text()).slice(0, 800_000);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Best-effort backlink discovery. We use DuckDuckGo to search for pages
 * mentioning the competitor's domain but excluding the domain itself.
 * Many of these will be dofollow links — there's no free way to know for
 * sure without actually fetching each page (we could, but it's slow).
 *
 * Limitation: this is a *mention finder* more than a true backlink index.
 * That's the same fundamental constraint Ahrefs / Semrush solve with
 * massive crawl infrastructure we can't match for free.
 */
async function findCompetitorBacklinks(
  competitorUrl: string,
  competitorDomain: string,
): Promise<CompetitorBacklink[]> {
  if (!competitorDomain) return [];

  const queries = [
    `"${competitorDomain}" -site:${competitorDomain}`,
    `link:${competitorUrl}`,
  ];

  const seen = new Set<string>();
  const out: CompetitorBacklink[] = [];

  for (const q of queries) {
    try {
      const results = await searchDuckDuckGo(q);
      for (const r of results) {
        let domain: string;
        try {
          domain = new URL(r.url).hostname.replace(/^www\./, "");
        } catch {
          continue;
        }
        if (domain === competitorDomain) continue;
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        out.push({
          url: r.url,
          domain,
          title: r.title,
          snippet: r.snippet,
        });
      }
    } catch {
      continue;
    }
    if (out.length >= 30) break;
  }

  return out.slice(0, 30);
}

/**
 * Check whether the competitor appears in each top-importance citation
 * directory for the given country. Best-effort: we try a domain-scoped
 * search on each directory site and treat 1+ results as "listed".
 */
async function checkCitations(
  competitorDomain: string,
  country: string,
): Promise<CompetitorCitationStatus[]> {
  if (!competitorDomain) return [];
  const top = citationsForCountry(country)
    .filter((c) => c.importance >= 4)
    .slice(0, 8);

  const out: CompetitorCitationStatus[] = [];
  for (const c of top) {
    try {
      const directoryHost = new URL(c.url).hostname.replace(/^www\./, "");
      const q = `site:${directoryHost} "${competitorDomain}"`;
      const results = await searchDuckDuckGo(q);
      out.push({ citation: c, listed: results.length > 0 });
    } catch {
      out.push({ citation: c, listed: "unknown" });
    }
  }
  return out;
}

/**
 * Pull on-page ranking signals from the homepage HTML + crawled pages.
 * Cheap, no external calls — derived purely from what we already fetched.
 */
function analyseRankingSignals(
  homepageHtml: string,
  competitorUrl: string,
  pages: CompetitorPage[],
): RankingSignals {
  const schemaTypes = new Set<string>();
  const schemaRe = /"@type"\s*:\s*"([^"]+)"/g;
  for (const m of homepageHtml.matchAll(schemaRe)) {
    schemaTypes.add(m[1]);
  }

  const totalWords = pages.reduce((s, p) => s + p.wordCount, 0);
  const avgWordCount = pages.length > 0 ? Math.round(totalWords / pages.length) : 0;
  const longFormCount = pages.filter((p) => p.wordCount >= 1500).length;

  // Internal-link density: count <a href="/..." or "<sameHost>"> in homepage
  let homepageHost = "";
  try {
    homepageHost = new URL(competitorUrl).hostname;
  } catch {
    homepageHost = "";
  }
  const linkRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let internalCount = 0;
  for (const m of homepageHtml.matchAll(linkRe)) {
    const href = m[1];
    if (href.startsWith("/")) internalCount++;
    else if (homepageHost && href.includes(homepageHost)) internalCount++;
  }
  const avgInternalLinks = internalCount; // homepage only — proxy

  return {
    schemaTypes: Array.from(schemaTypes).sort(),
    avgWordCount,
    longFormCount,
    avgInternalLinks,
    https: competitorUrl.startsWith("https://"),
    hasMetaDescription: /<meta[^>]+name=["']description["']/i.test(homepageHtml),
    usesCanonical: /<link[^>]+rel=["']canonical["']/i.test(homepageHtml),
    ogTagCount: (homepageHtml.match(/<meta[^>]+property=["']og:/gi) ?? [])
      .length,
  };
}

async function extractMetadata(url: string): Promise<CompetitorPage | null> {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html",
      },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) return null;
    const html = (await res.text()).slice(0, 500_000);

    const title = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description =
      extractAttr(
        html,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
      ) ?? "";
    const h1 = extractTag(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const text = stripHtmlBody(html);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    let segment = "/";
    let silo = "(home)";
    try {
      const u = new URL(url);
      segment = u.pathname;
      const parts = u.pathname.split("/").filter(Boolean);
      silo = parts[0] ?? "(home)";
    } catch {
      // ignore
    }

    return {
      url,
      title: cleanText(title),
      description: cleanText(description),
      h1: cleanText(h1),
      wordCount,
      pathSegment: segment,
      silo,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function aggregateSilos(
  pages: CompetitorPage[],
): { silo: string; count: number; sample: string[] }[] {
  const counts = new Map<string, string[]>();
  for (const p of pages) {
    const list = counts.get(p.silo) ?? [];
    list.push(p.url);
    counts.set(p.silo, list);
  }
  return Array.from(counts.entries())
    .map(([silo, urls]) => ({ silo, count: urls.length, sample: urls.slice(0, 3) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

const SYNTH_SYSTEM = `You analyse competitor websites and produce a concise "what they do that you don't" punch list for an SEO.

Rules:
- 5-8 bullets, each one specific and actionable.
- Anchor every bullet in something concrete (a content silo, a page type, a URL pattern, a tech stack choice).
- Order by impact (highest first).
- No marketing fluff, no preamble, no headers.
- One sentence per bullet, max 40 words.

Output ONLY the bullets, one per line, prefixed by "- ".`;

async function synthesiseGap(
  opts: { competitorUrl: string; myUrl?: string },
  pages: CompetitorPage[],
  silos: { silo: string; count: number; sample: string[] }[],
  signals: RankingSignals,
  backlinks: CompetitorBacklink[],
  citationStatus: CompetitorCitationStatus[],
): Promise<{ text: string | null; error?: string }> {
  if (pages.length === 0) {
    return { text: null, error: "No pages crawled — nothing to synthesise." };
  }

  const linkedFrom = backlinks.slice(0, 8).map((b) => b.domain);
  const listedAt = citationStatus
    .filter((c) => c.listed === true)
    .map((c) => c.citation.name);
  const missingCitations = citationStatus
    .filter((c) => c.listed === false)
    .map((c) => c.citation.name);

  const userPrompt = [
    `Competitor: ${opts.competitorUrl}`,
    opts.myUrl ? `Your site: ${opts.myUrl}` : "",
    "",
    `Crawled ${pages.length} pages.`,
    "",
    "Top content silos (path segment → page count):",
    ...silos.map((s) => `  /${s.silo}/ → ${s.count} pages`),
    "",
    "Sample page titles by silo:",
    ...silos.slice(0, 6).flatMap((s) =>
      s.sample.map((url) => {
        const page = pages.find((p) => p.url === url);
        return `  [${s.silo}] ${page?.title ?? url}`;
      }),
    ),
    "",
    `On-page signals: avg ${signals.avgWordCount} words/page, ${signals.longFormCount} long-form pages (>1500 words).`,
    `Schema types: ${signals.schemaTypes.length > 0 ? signals.schemaTypes.join(", ") : "(none detected)"}.`,
    `Homepage: ${signals.usesCanonical ? "uses canonical" : "no canonical"}, ${signals.hasMetaDescription ? "has meta description" : "missing meta description"}, ${signals.ogTagCount} OG tags, ~${signals.avgInternalLinks} internal links.`,
    "",
    linkedFrom.length > 0
      ? `Linked from external sites including: ${linkedFrom.join(", ")}.`
      : "No external mentions found.",
    listedAt.length > 0 ? `Listed in citation directories: ${listedAt.join(", ")}.` : "",
    missingCitations.length > 0
      ? `Citation gaps the competitor has too (you both missing): ${missingCitations.slice(0, 5).join(", ")}.`
      : "",
    "",
    "Write the punch list now. Bullets only. Cover content silos, on-page signals, and link / citation strategy.",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await callAI({
    system: SYNTH_SYSTEM,
    user: userPrompt,
    maxTokens: 600,
    temperature: 0.4,
    timeoutMs: 30_000,
    feature: "general",
  });
  if (!text) {
    return {
      text: null,
      error: lastAiFailure()?.message ?? "AI provider didn't respond. Set up a key in Settings.",
    };
  }
  return { text };
}

function extractTag(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? m[1] : "";
}
function extractAttr(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1] : null;
}
function stripHtmlBody(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const src = body ? body[1] : html;
  return src
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}
function cleanText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
