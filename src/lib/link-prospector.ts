/**
 * Free link-prospect discovery. Uses DuckDuckGo's HTML endpoint
 * (https://html.duckduckgo.com/html/) — no API key, no Playwright, plain
 * HTTP + tiny HTML parse. Produces ranked candidate URLs for outreach.
 *
 * Why DuckDuckGo over Google: Google blocks raw HTTP scraping aggressively
 * and forces consent/captcha flows. DuckDuckGo's HTML endpoint is stable,
 * unauthenticated, and returns a clean result list.
 */

export type ProspectQuery = {
  /** A built search query, e.g. `intitle:"resources" "digital marketing"` */
  q: string;
  /** Human label for the strategy producing this query. */
  strategy: ProspectStrategy;
};

export type ProspectStrategy =
  | "resource_pages"
  | "guest_post"
  | "links_pages"
  | "competitor_mentions"
  | "broken_link"
  | "industry_directories";

export type ProspectResult = {
  url: string;
  domain: string;
  title: string;
  snippet: string | null;
  strategy: ProspectStrategy;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; seo-tool/1.0; +https://example.com)";

/**
 * Build a set of search queries derived from a topic + optional competitor
 * domain. Each strategy targets a different link-building pattern that
 * actually works in 2025.
 */
export function buildProspectQueries(opts: {
  topic: string;
  competitorDomain?: string;
  myDomain?: string;
}): ProspectQuery[] {
  const t = opts.topic.trim();
  if (!t) return [];

  const queries: ProspectQuery[] = [
    {
      strategy: "resource_pages",
      q: `intitle:"resources" "${t}"`,
    },
    {
      strategy: "resource_pages",
      q: `inurl:resources "${t}"`,
    },
    {
      strategy: "links_pages",
      q: `inurl:links "${t}"`,
    },
    {
      strategy: "guest_post",
      q: `"${t}" "write for us"`,
    },
    {
      strategy: "guest_post",
      q: `"${t}" "guest post"`,
    },
    {
      strategy: "industry_directories",
      q: `"${t}" "submit your" -site:youtube.com`,
    },
  ];

  if (opts.competitorDomain) {
    queries.push({
      strategy: "competitor_mentions",
      q: `"${opts.competitorDomain}" -site:${opts.competitorDomain}`,
    });
  }

  return queries;
}

/**
 * Run a single search query against DuckDuckGo's HTML endpoint and parse
 * out the result list. Returns up to ~30 results.
 */
export async function searchDuckDuckGo(
  query: string,
  opts?: { signal?: AbortSignal; region?: string },
): Promise<{ url: string; title: string; snippet: string | null }[]> {
  const params = new URLSearchParams({ q: query });
  // DuckDuckGo's region. Without it every search is answered as if from
  // the US, which is how an Indian tape manufacturer's suggested
  // competitors came back as Walmart, Target and Home Depot. Verified
  // live: the same query with kl=in-en returns Indian manufacturers.
  if (opts?.region) params.set("kl", opts.region);
  const res = await fetch(
    `https://html.duckduckgo.com/html/?${params.toString()}`,
    {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html",
      },
      signal: opts?.signal,
    },
  );
  if (!res.ok) return [];
  const html = await res.text();
  return parseDuckDuckGoHtml(html);
}

/**
 * DuckDuckGo's `kl` region code for an ISO country, or undefined.
 *
 * Most markets are `<cc>-en`; the UK is `uk-en`, not `gb-en`; and a few
 * large non-English markets use their own language. An unrecognised code
 * is simply ignored by DuckDuckGo, so a miss degrades to no region
 * rather than to an error.
 */
export function duckDuckGoRegion(
  country: string | null | undefined,
): string | undefined {
  const cc = (country ?? "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return undefined;
  const special: Record<string, string> = {
    gb: "uk-en",
    de: "de-de",
    fr: "fr-fr",
    es: "es-es",
    it: "it-it",
    nl: "nl-nl",
    jp: "jp-jp",
    br: "br-pt",
    mx: "mx-es",
  };
  return special[cc] ?? `${cc}-en`;
}

/**
 * Parse the DuckDuckGo HTML result list. The page uses repeating
 * `<div class="result"> ... <a class="result__a" href="...">...</a> ... </div>`
 * blocks. We pull the URL out of the redirect URL DDG wraps results in.
 */
function parseDuckDuckGoHtml(
  html: string,
): { url: string; title: string; snippet: string | null }[] {
  const out: { url: string; title: string; snippet: string | null }[] = [];

  const blockRe = /<div class="result[^"]*"[\s\S]*?<\/div>\s*<\/div>/g;
  for (const block of html.match(blockRe) ?? []) {
    const aMatch = block.match(
      /<a [^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
    );
    if (!aMatch) continue;
    const rawHref = aMatch[1];
    const title = stripHtml(aMatch[2]).trim();
    const snippetMatch = block.match(
      /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
    );
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]).trim() : null;
    const url = unwrapDdgUrl(rawHref);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    out.push({ url, title, snippet });
  }

  return out;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function unwrapDdgUrl(href: string): string | null {
  // DDG wraps results as /l/?uddg=<encoded-url>&...
  if (href.startsWith("//duckduckgo.com/l/?") || href.startsWith("/l/?")) {
    const u = new URL(
      href.startsWith("//") ? `https:${href}` : `https://duckduckgo.com${href}`,
    );
    const target = u.searchParams.get("uddg");
    if (target) {
      try {
        return decodeURIComponent(target);
      } catch {
        return target;
      }
    }
    return null;
  }
  return href;
}

/**
 * Run every strategy query and collect deduped, ranked prospect results.
 * Excludes results from the user's own domain and any provided competitor
 * domain. Returns top N by simple frequency-of-domain scoring.
 */
export async function findProspects(opts: {
  topic: string;
  competitorDomain?: string;
  myDomain?: string;
  perQueryLimit?: number;
  totalLimit?: number;
}): Promise<ProspectResult[]> {
  const perQueryLimit = opts.perQueryLimit ?? 8;
  const totalLimit = opts.totalLimit ?? 40;
  const queries = buildProspectQueries(opts);

  const seen = new Map<string, ProspectResult>();
  const myDomain = normaliseDomain(opts.myDomain);
  const competitorDomain = normaliseDomain(opts.competitorDomain);

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 30_000);

  try {
    const settled = await Promise.allSettled(
      queries.map(async (q) => {
        const results = await searchDuckDuckGo(q.q, { signal: ac.signal });
        const limited = results.slice(0, perQueryLimit);
        return { query: q, results: limited };
      }),
    );
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      for (const r of s.value.results) {
        const domain = domainOf(r.url);
        if (!domain) continue;
        if (myDomain && domain.endsWith(myDomain)) continue;
        if (
          s.value.query.strategy !== "competitor_mentions" &&
          competitorDomain &&
          domain.endsWith(competitorDomain)
        )
          continue;
        if (isJunkDomain(domain)) continue;
        const key = r.url.split("#")[0];
        if (seen.has(key)) continue;
        seen.set(key, {
          url: r.url,
          domain,
          title: r.title,
          snippet: r.snippet,
          strategy: s.value.query.strategy,
        });
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  return Array.from(seen.values()).slice(0, totalLimit);
}

function normaliseDomain(d: string | undefined | null): string | null {
  if (!d) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(d) ? d : `https://${d}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const JUNK_HOSTS = new Set([
  "duckduckgo.com",
  "google.com",
  "bing.com",
  "yahoo.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "instagram.com",
  "amazon.com",
  "ebay.com",
]);

function isJunkDomain(domain: string): boolean {
  if (JUNK_HOSTS.has(domain)) return true;
  // Aggressive: skip giant aggregators that are never link prospects
  if (/\.(gov|mil)$/i.test(domain)) return true;
  return false;
}
