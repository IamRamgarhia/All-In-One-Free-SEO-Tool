"use server";

import { fetchSiteMetadata, type SiteMetadata } from "@/lib/site-metadata";
import { saveToolRun } from "@/lib/tool-runs";
import { guardedFetch, guardUrl } from "@/lib/url-guard";

export type DomainOverview = {
  ok: true;
  url: string;
  finalUrl: string;
  metadata: SiteMetadata;
  /** HTTPS + cert reachability. */
  https: { enabled: boolean; redirectsToHttps: boolean | null };
  /** First useful response headers — server, cache, security flags. */
  headers: {
    server: string | null;
    contentType: string | null;
    xPoweredBy: string | null;
    strictTransportSecurity: boolean;
    contentSecurityPolicy: boolean;
    xFrameOptions: string | null;
  };
  /** robots.txt presence + sitemap declarations. */
  robots: { found: boolean; sitemapCount: number; sitemaps: string[] };
  /** Counts of common signals on the homepage HTML. */
  page: {
    titleLength: number;
    descriptionLength: number;
    h1Count: number;
    imgCount: number;
    imgWithAlt: number;
    schemaTypes: string[];
    hasViewport: boolean;
    hasCanonical: boolean;
    isNoindex: boolean;
    wordCount: number;
    internalLinks: number;
    externalLinks: number;
  };
  /** Estimated indexed page count via Bing public site: search (free, no API). */
  indexedEstimate: number | null;
  /** Best-effort domain-age guess from last-modified or copyright year. */
  ageHint: string | null;
};

export type DomainOverviewResult =
  | DomainOverview
  | { ok: false; error: string };

const UA =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost) Domain-overview";

export async function runDomainOverview(
  rawUrl: string,
): Promise<DomainOverviewResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, error: "Paste a URL" };
  let url: string;
  try {
    url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    ).toString();
  } catch {
    return { ok: false, error: "Not a valid URL" };
  }

  const metadata = await fetchSiteMetadata(url);
  if (!metadata.reachable) {
    return { ok: false, error: "Couldn't reach the URL." };
  }

  const finalUrl = metadata.url;
  const baseOrigin = new URL(finalUrl).origin;

  // Re-fetch the homepage to inspect headers + parse signals
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15_000);
  let res: Response;
  try {
    res = await guardedFetch(finalUrl, {
      signal: c.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html" },
    });
  } catch {
    return { ok: false, error: "Timeout fetching homepage." };
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    return { ok: false, error: `Server returned ${res.status}` };
  }
  const html = (await res.text()).slice(0, 1_500_000);

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? "";
  const desc =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    )?.[1] ?? "";
  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imgWithAlt = imgs.filter((s) => /\balt=(?:"[^"]*"|'[^']*')/i.test(s))
    .length;
  const schemaTypes = collectSchemaTypes(html);
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  const isNoindex =
    /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html) ||
    /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(
      html,
    );

  // Word count = visible text after stripping tags + scripts/styles
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = visible ? visible.split(/\s+/).length : 0;

  // Link counts
  const links = [...html.matchAll(/<a\s+[^>]*href=(?:"([^"]*)"|'([^']*)')/gi)]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean);
  let internalLinks = 0;
  let externalLinks = 0;
  for (const l of links) {
    if (l.startsWith("#") || l.startsWith("javascript:")) continue;
    try {
      const abs = new URL(l, finalUrl);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
      if (abs.origin === baseOrigin) internalLinks++;
      else externalLinks++;
    } catch {
      // ignore
    }
  }

  const headers = {
    server: res.headers.get("server"),
    contentType: res.headers.get("content-type"),
    xPoweredBy: res.headers.get("x-powered-by"),
    strictTransportSecurity: !!res.headers.get("strict-transport-security"),
    contentSecurityPolicy: !!res.headers.get("content-security-policy"),
    xFrameOptions: res.headers.get("x-frame-options"),
  };

  const https = await checkHttps(finalUrl);
  const robots = await fetchRobots(baseOrigin);
  const indexedEstimate = await estimateIndexedFromBing(
    new URL(finalUrl).hostname,
  );
  const ageHint = guessAgeHint(html);

  const result: DomainOverview = {
    ok: true,
    url,
    finalUrl,
    metadata,
    https,
    headers,
    robots,
    page: {
      titleLength: title.length,
      descriptionLength: desc.length,
      h1Count,
      imgCount: imgs.length,
      imgWithAlt,
      schemaTypes,
      hasViewport,
      hasCanonical,
      isNoindex,
      wordCount,
      internalLinks,
      externalLinks,
    },
    indexedEstimate,
    ageHint,
  };
  await saveToolRun({
    toolId: "domain-overview",
    label: finalUrl,
    input: { url: rawUrl },
    result,
  }).catch(() => undefined);
  return result;
}

async function checkHttps(
  u: string,
): Promise<{ enabled: boolean; redirectsToHttps: boolean | null }> {
  const httpsEnabled = u.startsWith("https://");
  const httpUrl = u.replace(/^https?:\/\//, "http://");
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8_000);
    // guardUrl then a manual fetch, NOT guardedFetch: this check reads
    // the Location header to find out whether http:// redirects to
    // https://, and guardedFetch follows redirects itself — so the
    // response it returns is the final one, which has no Location and
    // would report every site as not redirecting.
    const verdict = await guardUrl(httpUrl);
    if (!verdict.ok) {
      clearTimeout(t);
      return { enabled: httpsEnabled, redirectsToHttps: null };
    }
    const r = await fetch(httpUrl, {
      method: "HEAD",
      redirect: "manual",
      signal: c.signal,
      headers: { "user-agent": UA },
    });
    clearTimeout(t);
    const loc = r.headers.get("location") ?? "";
    return {
      enabled: httpsEnabled,
      redirectsToHttps: loc.startsWith("https://") ? true : false,
    };
  } catch {
    return { enabled: httpsEnabled, redirectsToHttps: null };
  }
}

async function fetchRobots(
  origin: string,
): Promise<{ found: boolean; sitemapCount: number; sitemaps: string[] }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8_000);
    const r = await guardedFetch(`${origin}/robots.txt`, {
      signal: c.signal,
      headers: { "user-agent": UA },
    });
    clearTimeout(t);
    if (!r.ok) return { found: false, sitemapCount: 0, sitemaps: [] };
    const body = await r.text();
    const sitemaps = [
      ...body.matchAll(/^\s*Sitemap:\s*(\S+)/gim),
    ].map((m) => m[1].trim());
    return { found: true, sitemapCount: sitemaps.length, sitemaps };
  } catch {
    return { found: false, sitemapCount: 0, sitemaps: [] };
  }
}

function collectSchemaTypes(html: string): string[] {
  const types = new Set<string>();
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const m of blocks) {
    const body = m[1].trim();
    if (!body) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const graph = Array.isArray(obj["@graph"])
        ? (obj["@graph"] as Record<string, unknown>[])
        : [obj];
      for (const node of graph) {
        const t = node["@type"];
        if (typeof t === "string") types.add(t);
        else if (Array.isArray(t)) for (const x of t) types.add(String(x));
      }
    }
  }
  return Array.from(types);
}

/**
 * Bing's public search page reports a "X results" hit count we can scrape
 * for a rough indexed-page estimate. Free, no key. Coarse signal — useful
 * for "tens vs thousands vs millions" not exact counts.
 */
async function estimateIndexedFromBing(host: string): Promise<number | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8_000);
    const r = await guardedFetch(
      `https://www.bing.com/search?q=site%3A${encodeURIComponent(host)}`,
      {
        signal: c.signal,
        headers: { "user-agent": UA },
      },
    );
    clearTimeout(t);
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/([\d,]+)\s+results/i);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function guessAgeHint(html: string): string | null {
  // Look for ©YYYY or Copyright YYYY in the HTML
  const copy = html.match(/(?:©|copyright)[\s\S]{0,30}?(\d{4})/i);
  if (copy) {
    const y = Number(copy[1]);
    const now = new Date().getFullYear();
    if (y >= 1995 && y <= now)
      return `Copyright says since ${y} (~${now - y} years)`;
  }
  return null;
}
