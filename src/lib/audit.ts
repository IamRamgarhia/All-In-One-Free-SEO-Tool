export type Severity = "critical" | "high" | "medium" | "low";

export type AuditFinding = {
  type: string;
  severity: Severity;
  message: string;
  url: string;
};

export type AuditResult = {
  url: string;
  finalUrl: string;
  status: number;
  fetchedAt: Date;
  pagesCrawled: number;
  findings: AuditFinding[];
  score: number;
};

const severityWeight: Record<Severity, number> = {
  critical: 25,
  high: 8,
  medium: 3,
  low: 1,
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractMeta(html: string, name: string, attr = "name"): string | null {
  const re1 = new RegExp(
    `<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1) return decodeEntities(m1[1].trim());
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${name}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1].trim()) : null;
}

function extractAll(html: string, tagPattern: RegExp): string[] {
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(tagPattern.source, "gi");
  while ((m = re.exec(html))) matches.push(m[1]);
  return matches.map((s) => decodeEntities(s.replace(/<[^>]+>/g, "").trim()));
}

function extractLink(html: string, rel: string): string | null {
  const m = html.match(
    new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*href=["']([^"']+)["']`, "i"),
  );
  if (m) return m[1].trim();
  const m2 = html.match(
    new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]*rel=["']${rel}["']`, "i"),
  );
  return m2 ? m2[1].trim() : null;
}

function extractHrefs(html: string, baseUrl: string): string[] {
  const re = /<a\s+[^>]*href=["']([^"']+)["']/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1], baseUrl);
      // drop query strings + hash to dedupe; keep path
      abs.hash = "";
      // Strip common tracking params
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach(
        (p) => abs.searchParams.delete(p),
      );
      out.add(abs.toString());
    } catch {
      // ignore malformed
    }
  }
  return Array.from(out);
}

function countWords(html: string): number {
  // strip script/style, then tags, count tokens
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(stripped).replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function hasJsonLd(html: string): boolean {
  return /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
}

function checkHeadingOrder(html: string): boolean {
  // True if first heading is h1 (or no headings yet)
  const m = html.match(/<h([1-6])\b/i);
  if (!m) return true;
  return m[1] === "1";
}

type FetchedPage = {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  headers: Headers;
  responseTimeMs: number;
  redirectHops: number;
};

async function fetchPage(url: string, timeoutMs = 12_000): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();
    const elapsed = Date.now() - start;
    return {
      url,
      finalUrl: res.url,
      status: res.status,
      html,
      headers: res.headers,
      responseTimeMs: elapsed,
      redirectHops: res.redirected ? 1 : 0, // fetch doesn't expose count, approximate
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchUrlStatus(
  url: string,
  timeoutMs = 8_000,
): Promise<{ status: number; finalUrl: string } | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      method: "HEAD",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT },
    });
    return { status: res.status, finalUrl: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(
  url: string,
  timeoutMs = 6_000,
): Promise<{ status: number; text: string } | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT },
    });
    const text = await res.text();
    return { status: res.status, text };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Per-page checks
// ───────────────────────────────────────────────────────────────────────────

function checkPage(page: FetchedPage): {
  findings: AuditFinding[];
  meta: { title: string | null; description: string | null };
} {
  const findings: AuditFinding[] = [];
  const url = page.finalUrl;
  const html = page.html;

  if (page.status >= 400) {
    findings.push({
      type: "bad_status",
      severity: "critical",
      url,
      message: `Server returned HTTP ${page.status} on ${url}.`,
    });
  }

  if (!page.finalUrl.startsWith("https://")) {
    findings.push({
      type: "no_https",
      severity: "critical",
      url,
      message: "Page is not served over HTTPS.",
    });
  }

  if (page.responseTimeMs > 2_000) {
    findings.push({
      type: "slow_response",
      severity: "medium",
      url,
      message: `Server responded in ${page.responseTimeMs}ms — aim for under 800ms.`,
    });
  }

  // Title checks
  const title = extractTitle(html);
  if (!title) {
    findings.push({
      type: "missing_title",
      severity: "critical",
      url,
      message: "Missing <title> tag.",
    });
  } else if (title.length < 10) {
    findings.push({
      type: "short_title",
      severity: "high",
      url,
      message: `Title is only ${title.length} characters — aim for 50–60.`,
    });
  } else if (title.length > 60) {
    findings.push({
      type: "long_title",
      severity: "medium",
      url,
      message: `Title is ${title.length} characters — Google may truncate beyond ~60.`,
    });
  }

  // Meta description
  const description = extractMeta(html, "description");
  if (!description) {
    findings.push({
      type: "missing_meta_description",
      severity: "high",
      url,
      message: "Missing meta description.",
    });
  } else if (description.length < 50) {
    findings.push({
      type: "short_meta_description",
      severity: "medium",
      url,
      message: `Meta description is ${description.length} characters — aim for 120–155.`,
    });
  } else if (description.length > 160) {
    findings.push({
      type: "long_meta_description",
      severity: "low",
      url,
      message: `Meta description is ${description.length} characters — may truncate beyond ~160.`,
    });
  }

  // H1
  const h1s = extractAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (h1s.length === 0) {
    findings.push({
      type: "missing_h1",
      severity: "high",
      url,
      message: "No <h1> heading on the page.",
    });
  }

  // Heading order
  if (!checkHeadingOrder(html)) {
    findings.push({
      type: "heading_order",
      severity: "low",
      url,
      message: "First heading isn't an <h1> — heading hierarchy may be off.",
    });
  }

  // Canonical
  if (!extractLink(html, "canonical")) {
    findings.push({
      type: "missing_canonical",
      severity: "medium",
      url,
      message: "Missing <link rel='canonical'>.",
    });
  }

  // Viewport
  if (!extractMeta(html, "viewport")) {
    findings.push({
      type: "missing_viewport",
      severity: "high",
      url,
      message: "No viewport meta — page won't render correctly on mobile.",
    });
  }

  // Robots / noindex
  const robots = extractMeta(html, "robots");
  if (robots && /noindex/i.test(robots)) {
    findings.push({
      type: "noindex_set",
      severity: "critical",
      url,
      message: "Page has noindex set — Google will not index it.",
    });
  }

  // Lang
  if (!/<html[^>]+lang=["'][^"']+["']/i.test(html)) {
    findings.push({
      type: "missing_lang",
      severity: "low",
      url,
      message: "No lang attribute on <html>.",
    });
  }

  // Favicon
  if (!extractLink(html, "icon") && !extractLink(html, "shortcut icon")) {
    findings.push({
      type: "missing_favicon",
      severity: "low",
      url,
      message: "No favicon link.",
    });
  }

  // OpenGraph
  if (!extractMeta(html, "og:title", "property")) {
    findings.push({
      type: "missing_og_tags",
      severity: "low",
      url,
      message: "No OpenGraph tags — social shares will look unbranded.",
    });
  }

  // Schema
  if (!hasJsonLd(html)) {
    findings.push({
      type: "missing_schema",
      severity: "medium",
      url,
      message:
        "No JSON-LD structured data — schema markup unlocks rich results in search.",
    });
  }

  // Image alt + lazy loading + format
  const imgTags = html.match(/<img\s[^>]*>/gi) ?? [];
  const sample = imgTags.slice(0, 30);
  const missingAlt = sample.filter(
    (t) => !/\salt\s*=\s*["'][^"']*["']/i.test(t),
  ).length;
  if (missingAlt > 0) {
    findings.push({
      type: "missing_image_alt",
      severity: "medium",
      url,
      message: `${missingAlt} of the first ${sample.length} images lack alt text.`,
    });
  }
  const noLazy = sample.filter(
    (t) =>
      !/loading\s*=\s*["']lazy["']/i.test(t) &&
      !/decoding\s*=\s*["']async["']/i.test(t),
  ).length;
  if (sample.length >= 5 && noLazy >= sample.length - 1) {
    findings.push({
      type: "no_lazy_loading",
      severity: "low",
      url,
      message: `${noLazy} images don't use loading="lazy" — slows initial render.`,
    });
  }
  const oldFormat = sample.filter((t) => {
    const src = t.match(/src\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    return /\.(jpg|jpeg|png|gif)(\?|$)/i.test(src);
  }).length;
  if (oldFormat >= 5) {
    findings.push({
      type: "old_image_formats",
      severity: "low",
      url,
      message: `${oldFormat} images use legacy formats — convert to WebP/AVIF for ~30% smaller files.`,
    });
  }

  // Content thinness
  const wordCount = countWords(html);
  if (wordCount < 200) {
    findings.push({
      type: "thin_content",
      severity: "medium",
      url,
      message: `Page has only ${wordCount} words — Google may classify as thin content.`,
    });
  }

  return {
    findings,
    meta: { title, description },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Site-wide checks
// ───────────────────────────────────────────────────────────────────────────

async function checkSiteWide(
  homeUrl: string,
  pages: FetchedPage[],
  metaIndex: Map<string, { title: string | null; description: string | null }>,
): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const root = new URL(homeUrl);
  const origin = root.origin;

  // robots.txt
  const robotsTxt = await fetchText(`${origin}/robots.txt`);
  let robotsExists = false;
  if (!robotsTxt || robotsTxt.status >= 400) {
    findings.push({
      type: "missing_robots_txt",
      severity: "medium",
      url: `${origin}/robots.txt`,
      message:
        "No /robots.txt found — search engines guess your crawl preferences.",
    });
  } else {
    robotsExists = true;
    if (
      !/User-agent:/i.test(robotsTxt.text) ||
      robotsTxt.text.length < 10
    ) {
      findings.push({
        type: "invalid_robots_txt",
        severity: "low",
        url: `${origin}/robots.txt`,
        message: "robots.txt exists but looks malformed or empty.",
      });
    }
  }

  // sitemap.xml — try root + check robots.txt for Sitemap: directive
  const sitemapUrls = new Set<string>([`${origin}/sitemap.xml`]);
  if (robotsExists && robotsTxt) {
    const sitemapMatch = robotsTxt.text.match(/^Sitemap:\s*(\S+)/gim);
    if (sitemapMatch) {
      for (const line of sitemapMatch) {
        const u = line.replace(/^Sitemap:\s*/i, "").trim();
        if (u) sitemapUrls.add(u);
      }
    }
  }
  let foundSitemap = false;
  for (const sm of sitemapUrls) {
    const r = await fetchText(sm);
    if (r && r.status < 400 && /<urlset|<sitemapindex/i.test(r.text)) {
      foundSitemap = true;
      break;
    }
  }
  if (!foundSitemap) {
    findings.push({
      type: "missing_sitemap",
      severity: "medium",
      url: `${origin}/sitemap.xml`,
      message:
        "No valid sitemap.xml found — sitemaps help Google discover pages faster.",
    });
  }

  // Security headers (check on homepage response)
  const home = pages.find((p) => p.url === homeUrl) ?? pages[0];
  if (home) {
    const missing: string[] = [];
    if (!home.headers.get("strict-transport-security")) missing.push("HSTS");
    if (!home.headers.get("x-content-type-options"))
      missing.push("X-Content-Type-Options");
    if (
      !home.headers.get("content-security-policy") &&
      !home.headers.get("content-security-policy-report-only")
    )
      missing.push("Content-Security-Policy");
    if (
      !home.headers.get("x-frame-options") &&
      !home.headers.get("content-security-policy")?.match(/frame-ancestors/i)
    )
      missing.push("X-Frame-Options");

    if (missing.length >= 3) {
      findings.push({
        type: "missing_security_headers",
        severity: "medium",
        url: homeUrl,
        message: `Missing ${missing.length} security headers: ${missing.join(", ")}.`,
      });
    } else if (missing.length > 0) {
      findings.push({
        type: "missing_security_headers",
        severity: "low",
        url: homeUrl,
        message: `Missing security headers: ${missing.join(", ")}.`,
      });
    }
  }

  // Duplicate titles + descriptions
  const titleMap = new Map<string, string[]>();
  const descMap = new Map<string, string[]>();
  for (const [u, m] of metaIndex.entries()) {
    if (m.title) {
      const list = titleMap.get(m.title) ?? [];
      list.push(u);
      titleMap.set(m.title, list);
    }
    if (m.description) {
      const list = descMap.get(m.description) ?? [];
      list.push(u);
      descMap.set(m.description, list);
    }
  }
  for (const [title, urls] of titleMap.entries()) {
    if (urls.length > 1) {
      findings.push({
        type: "duplicate_title",
        severity: "high",
        url: urls[0],
        message: `${urls.length} pages share the title "${title.slice(0, 60)}…" — each page should have a unique title.`,
      });
    }
  }
  for (const [, urls] of descMap.entries()) {
    if (urls.length > 1) {
      findings.push({
        type: "duplicate_meta_description",
        severity: "medium",
        url: urls[0],
        message: `${urls.length} pages share the same meta description.`,
      });
    }
  }

  // Hreflang consistency (basic check)
  let hreflangSeen = 0;
  for (const p of pages) {
    if (/<link[^>]+rel=["']alternate["'][^>]+hreflang=/i.test(p.html))
      hreflangSeen++;
  }
  if (hreflangSeen > 0 && hreflangSeen < pages.length) {
    findings.push({
      type: "inconsistent_hreflang",
      severity: "low",
      url: homeUrl,
      message: `Hreflang tags exist on ${hreflangSeen} of ${pages.length} pages — usually all language variants should declare them.`,
    });
  }

  return findings;
}

async function checkBrokenLinks(
  pages: FetchedPage[],
  origin: string,
  maxToCheck = 30,
): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const allLinks = new Set<string>();
  const onPage = new Map<string, string>(); // link -> first page that contains it

  for (const p of pages) {
    for (const href of extractHrefs(p.html, p.finalUrl)) {
      try {
        if (new URL(href).origin !== origin) continue;
        if (!allLinks.has(href)) {
          allLinks.add(href);
          onPage.set(href, p.finalUrl);
        }
      } catch {
        // ignore
      }
    }
  }

  // Check up to maxToCheck links not already in our crawled set
  const visited = new Set(pages.map((p) => p.finalUrl));
  const toCheck = Array.from(allLinks)
    .filter((u) => !visited.has(u))
    .slice(0, maxToCheck);

  let broken = 0;
  for (const u of toCheck) {
    const r = await fetchUrlStatus(u);
    if (r && r.status >= 400) {
      broken++;
      if (broken <= 5) {
        findings.push({
          type: "broken_link",
          severity: "high",
          url: onPage.get(u) ?? u,
          message: `Link to ${u} returned HTTP ${r.status}.`,
        });
      }
    }
  }
  if (broken > 5) {
    findings.push({
      type: "broken_link",
      severity: "high",
      url: origin,
      message: `${broken - 5} more broken internal links (showing first 5 above).`,
    });
  }

  return findings;
}

// ───────────────────────────────────────────────────────────────────────────
// Crawler
// ───────────────────────────────────────────────────────────────────────────

async function crawlSite(
  homeUrl: string,
  options: { maxPages: number; maxDepth: number },
): Promise<FetchedPage[]> {
  const visited = new Set<string>();
  const results: FetchedPage[] = [];
  const origin = new URL(homeUrl).origin;

  // BFS queue: [url, depth]
  const queue: { url: string; depth: number }[] = [
    { url: homeUrl, depth: 0 },
  ];
  visited.add(homeUrl);

  while (queue.length > 0 && results.length < options.maxPages) {
    const { url, depth } = queue.shift()!;
    const page = await fetchPage(url);
    if (!page) continue;
    if (!page.headers.get("content-type")?.includes("html")) continue;
    results.push(page);

    if (depth < options.maxDepth) {
      for (const href of extractHrefs(page.html, page.finalUrl)) {
        try {
          const u = new URL(href);
          if (u.origin !== origin) continue;
          if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|avif|mp4|zip|css|js)(\?|$)/i.test(u.pathname))
            continue;
          if (visited.has(u.toString())) continue;
          visited.add(u.toString());
          if (visited.size > options.maxPages * 4) break; // soft cap on queue
          queue.push({ url: u.toString(), depth: depth + 1 });
        } catch {
          // ignore
        }
      }
    }
  }

  return results;
}

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

export async function runAudit(
  rawUrl: string,
  options: { maxPages?: number; maxDepth?: number } = {},
): Promise<AuditResult> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const fetchedAt = new Date();
  const maxPages = options.maxPages ?? 25;
  const maxDepth = options.maxDepth ?? 2;

  // Crawl
  let pages: FetchedPage[];
  try {
    pages = await crawlSite(url, { maxPages, maxDepth });
  } catch (err) {
    return {
      url,
      finalUrl: url,
      status: 0,
      fetchedAt,
      pagesCrawled: 0,
      findings: [
        {
          type: "fetch_failed",
          severity: "critical",
          url,
          message: `Could not crawl: ${(err as Error).message}`,
        },
      ],
      score: 0,
    };
  }

  if (pages.length === 0) {
    return {
      url,
      finalUrl: url,
      status: 0,
      fetchedAt,
      pagesCrawled: 0,
      findings: [
        {
          type: "fetch_failed",
          severity: "critical",
          url,
          message: "No pages reachable. Check the URL or your network.",
        },
      ],
      score: 0,
    };
  }

  // Per-page checks
  const findings: AuditFinding[] = [];
  const metaIndex = new Map<
    string,
    { title: string | null; description: string | null }
  >();

  for (const page of pages) {
    const r = checkPage(page);
    findings.push(...r.findings);
    metaIndex.set(page.finalUrl, r.meta);
  }

  // Site-wide checks
  const siteFindings = await checkSiteWide(url, pages, metaIndex);
  findings.push(...siteFindings);

  // Broken links (best effort, capped)
  const origin = new URL(url).origin;
  const linkFindings = await checkBrokenLinks(pages, origin);
  findings.push(...linkFindings);

  // Score = 100 - sum(weights), clamped 0..100
  // Weights compound for repeated findings of same type to avoid one duplicate
  // pattern flooding the score.
  const totalWeight = findings.reduce(
    (sum, f) => sum + severityWeight[f.severity],
    0,
  );
  // Normalize by pages crawled so a 25-page site doesn't score worse than a
  // 1-page site for the same proportion of issues.
  const normalized = totalWeight / Math.sqrt(Math.max(1, pages.length));
  const score = Math.max(0, Math.min(100, Math.round(100 - normalized)));

  const home = pages[0];
  return {
    url,
    finalUrl: home.finalUrl,
    status: home.status,
    fetchedAt,
    pagesCrawled: pages.length,
    findings,
    score,
  };
}
