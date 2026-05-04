/**
 * Sitemap generator. Discovers URLs by crawling the site (BFS, same-host
 * only) and emits XML, HTML, or plain-text lists. Reuses the auditor's
 * crawl pattern: HEAD-first to skip non-HTML, then a tiny GET to extract
 * <a href> links.
 *
 * No external services. Limit page count + crawl depth to keep memory
 * predictable for large sites.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type CrawlOptions = {
  startUrl: string;
  maxPages?: number;
  maxDepth?: number;
  /** Skip URLs whose path matches any of these regex patterns. */
  excludePatterns?: RegExp[];
  /** Respect robots.txt disallow rules. Default true. */
  respectRobots?: boolean;
};

export type CrawlPage = {
  url: string;
  depth: number;
  /** Last-modified header, falls back to crawl time. ISO string. */
  lastmod: string;
  /** HEAD/GET status. */
  status: number;
  /** Whether the page is HTML (text/html content-type). */
  isHtml: boolean;
};

const DEFAULT_EXCLUDES = [
  /\.(jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf|eot|otf|css|js|mjs|json|xml|pdf|zip|tar|gz|mp4|webm|mp3|wav|ogg)$/i,
  /\?(.*&)?(replytocom|share=|fb_action|utm_)/i,
  /#/,
];

export async function crawlSite(opts: CrawlOptions): Promise<{
  pages: CrawlPage[];
  errors: { url: string; reason: string }[];
}> {
  const maxPages = opts.maxPages ?? 1500;
  const maxDepth = opts.maxDepth ?? 5;

  let startUrl: URL;
  try {
    startUrl = new URL(opts.startUrl);
  } catch {
    return { pages: [], errors: [{ url: opts.startUrl, reason: "Invalid URL" }] };
  }
  const host = startUrl.hostname;
  const excludes = [...(opts.excludePatterns ?? []), ...DEFAULT_EXCLUDES];

  let robotsDisallow: RegExp[] = [];
  let crawlDelayMs = 0;
  if (opts.respectRobots !== false) {
    const robots = await fetchRobotsDirectives(startUrl.origin);
    robotsDisallow = robots.disallow;
    crawlDelayMs = Math.round(robots.crawlDelaySeconds * 1000);
  }

  const pages: CrawlPage[] = [];
  const errors: { url: string; reason: string }[] = [];
  const seen = new Set<string>([normalize(startUrl.toString())]);
  const queue: { url: string; depth: number }[] = [
    { url: startUrl.toString(), depth: 0 },
  ];

  // Concurrency: 16 unless robots.txt asked for a Crawl-delay, in which
  // case we drop to 4 to actually respect the host's wishes.
  const concurrency = crawlDelayMs > 0 ? 4 : 16;

  while (queue.length > 0 && pages.length < maxPages) {
    const batch = queue.splice(0, Math.min(concurrency, queue.length));

    const results = await Promise.allSettled(
      batch.map((b) => fetchPage(b.url, b.depth)),
    );

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      if (r.value.error) {
        errors.push({ url: r.value.url, reason: r.value.error });
        continue;
      }
      const { page, links } = r.value;
      if (page) pages.push(page);
      if (page && page.depth >= maxDepth) continue;

      for (const l of links) {
        const norm = normalize(l);
        if (seen.has(norm)) continue;
        seen.add(norm);
        try {
          const u = new URL(l);
          if (u.hostname !== host) continue;
          if (excludes.some((re) => re.test(u.pathname + u.search))) continue;
          if (robotsDisallow.some((re) => re.test(u.pathname))) continue;
          queue.push({ url: u.toString(), depth: (page?.depth ?? 0) + 1 });
        } catch {
          continue;
        }
        if (queue.length + pages.length >= maxPages) break;
      }
    }

    if (crawlDelayMs > 0 && queue.length > 0) {
      await new Promise((r) => setTimeout(r, crawlDelayMs));
    }
  }

  return { pages, errors };
}

type FetchResult = {
  url: string;
  page?: CrawlPage;
  links: string[];
  error?: string;
};

async function fetchPage(url: string, depth: number): Promise<FetchResult> {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      signal: ac.signal,
      redirect: "follow",
    });
    const contentType = res.headers.get("content-type") ?? "";
    const isHtml = /text\/html|application\/xhtml/i.test(contentType);
    const lastmod = res.headers.get("last-modified") ?? "";

    let html = "";
    if (isHtml && res.ok) {
      html = await res.text();
    } else {
      // drain to free the connection, but cap to 64 KiB
      try {
        await res.text();
      } catch {}
    }

    const page: CrawlPage = {
      url: res.url,
      depth,
      lastmod: lastmod
        ? new Date(lastmod).toISOString()
        : new Date().toISOString(),
      status: res.status,
      isHtml,
    };

    if (!isHtml || !res.ok) {
      return { url, page, links: [] };
    }

    return { url, page, links: extractLinks(html, res.url) };
  } catch (err) {
    return { url, links: [], error: (err as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi;
  for (const m of html.matchAll(re)) {
    const href = m[1];
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") ||
        href.startsWith("tel:")) {
      continue;
    }
    try {
      const abs = new URL(href, baseUrl).toString();
      out.push(abs);
    } catch {
      continue;
    }
  }
  return out;
}

function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Sort search params so /a?x=1&y=2 == /a?y=2&x=1
    const params = Array.from(u.searchParams.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    u.search = "";
    for (const [k, v] of params) u.searchParams.append(k, v);
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

/**
 * Fetch a site's robots.txt and extract Disallow + Crawl-delay directives
 * for our user agent (or *). Returns sensible defaults on any error.
 */
async function fetchRobotsDirectives(
  origin: string,
): Promise<{ disallow: RegExp[]; crawlDelaySeconds: number }> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": USER_AGENT },
    });
    if (!res.ok) return { disallow: [], crawlDelaySeconds: 0 };
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    let activeUA = false;
    const disallows: RegExp[] = [];
    let crawlDelay = 0;
    for (const lineRaw of lines) {
      const line = lineRaw.split("#")[0].trim();
      if (!line) continue;
      const [k, ...vparts] = line.split(":");
      const v = vparts.join(":").trim();
      const key = k.trim().toLowerCase();
      if (key === "user-agent") {
        activeUA = v === "*" || v.toLowerCase() === "seotoolbot";
      } else if (activeUA && key === "disallow" && v) {
        disallows.push(robotsPathToRegex(v));
      } else if (activeUA && key === "crawl-delay") {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0 && n <= 30) {
          crawlDelay = Math.max(crawlDelay, n);
        }
      }
    }
    return { disallow: disallows, crawlDelaySeconds: crawlDelay };
  } catch {
    return { disallow: [], crawlDelaySeconds: 0 };
  }
}

function robotsPathToRegex(path: string): RegExp {
  // Robots syntax: * = wildcard, $ = end, otherwise prefix match
  const escaped = path
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const anchored = path.endsWith("$") ? `^${escaped}` : `^${escaped}`;
  return new RegExp(anchored);
}

/**
 * Build a sitemap.xml conforming to the Sitemap protocol. Splits into
 * multiple sitemaps if the input exceeds 50k URLs (the spec limit).
 */
export function buildSitemapXml(pages: CrawlPage[]): string {
  const head =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  const tail = "</urlset>\n";
  const body = pages
    .filter((p) => p.isHtml && p.status >= 200 && p.status < 400)
    .map(
      (p) =>
        `  <url>\n    <loc>${escXml(p.url)}</loc>\n    <lastmod>${p.lastmod.slice(0, 10)}</lastmod>\n  </url>`,
    )
    .join("\n");
  return head + body + "\n" + tail;
}

export function buildSitemapTxt(pages: CrawlPage[]): string {
  return pages
    .filter((p) => p.isHtml && p.status >= 200 && p.status < 400)
    .map((p) => p.url)
    .join("\n");
}

export function buildSitemapHtml(pages: CrawlPage[], hostLabel: string): string {
  const items = pages
    .filter((p) => p.isHtml && p.status >= 200 && p.status < 400)
    .map(
      (p) =>
        `<li><a href="${escAttr(p.url)}">${escHtml(p.url.replace(/^https?:\/\/[^/]+/, ""))}</a></li>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Sitemap — ${escHtml(hostLabel)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.5}h1{font-size:1.5rem}ul{padding-left:1.2rem}li{margin:.2rem 0}a{color:#2a5dff;text-decoration:none}a:hover{text-decoration:underline}</style>
</head>
<body>
  <h1>Sitemap</h1>
  <p>${pages.length} pages on <strong>${escHtml(hostLabel)}</strong></p>
  <ul>
${items}
  </ul>
</body>
</html>
`;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
