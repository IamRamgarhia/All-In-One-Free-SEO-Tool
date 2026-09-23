/**
 * Does the site already do this?
 *
 * Task templates emit a fixed checklist per tech stack and per niche.
 * Nothing looked at the site first, so an audit of one real install found
 * 8 of 13 open template tasks were advice about work finished years ago:
 * add canonical tags (every page had them), generate a sitemap (it was in
 * robots.txt), add JSON-LD (it was in the head), enable HTTP/2 (ALPN said
 * h2), set cache headers (immutable, a year), fix permalinks, block
 * directory indexing, install an SEO plugin.
 *
 * That is worse than a missing feature. The first screen a client sees is
 * a to-do list, and two thirds of it is wrong about their own website.
 *
 * So: read the site once, then ask each template whether it is already
 * satisfied. Two rules make this safe to act on:
 *
 *   1. **Unknown is not done.** Every check returns a verdict or null, and
 *      null keeps the task. A site that is unreachable, or a claim we have
 *      no way to test, produces the same checklist as before. A needless
 *      task costs a minute; a skipped task costs the thing it was for.
 *   2. **Every skip carries its evidence**, and the caller writes it to
 *      the activity log. "Skipped: canonical present on homepage and 3
 *      sampled pages" is checkable. A silently shorter list is not.
 *
 * Claims about "every page" are judged on a sample — the homepage plus up
 * to three internal pages — and the evidence always says so.
 */

import { guardedFetch } from "./url-guard";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_SAMPLED_PAGES = 3;
const MAX_HTML_BYTES = 1_500_000;

export type PageSample = {
  url: string;
  status: number;
  html: string;
};

export type SiteFacts = {
  /** The URL as given. */
  requestedUrl: string;
  /** Where the homepage actually ended up, after redirects. */
  finalUrl: string;
  reachable: boolean;
  status: number;
  html: string;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  /** Homepage first, then up to MAX_SAMPLED_PAGES internal pages. */
  pages: PageSample[];
  robotsTxt: { status: number; body: string } | null;
  sitemap: { url: string; status: number; valid: boolean } | null;
  /** A directory that should not be listable, if the stack has one. */
  directoryListing: { url: string; status: number; isListing: boolean } | null;
  staticAsset: { url: string; cacheControl: string | null } | null;
  /** Negotiated over TLS: "h2", "http/1.1", or null when it could not run. */
  alpn: string | null;
  /** Whether a plain http:// request lands on https. null when untested. */
  httpsRedirect: boolean | null;
  fetchedAt: string;
};

export type TemplateVerdict = { done: true; evidence: string };

/** null means "keep the task" — either not done, or not knowable. */
type Check = (f: SiteFacts) => TemplateVerdict | null;

// ───────────────────────────────────────────────────────────────────────────
// Reading the site
// ───────────────────────────────────────────────────────────────────────────

async function getText(
  url: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<{ status: number; body: string; headers: Headers; url: string } | null> {
  try {
    const res = await guardedFetch(url, {
      ...init,
      headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const raw = await res.text();
    return {
      status: res.status,
      body: raw.slice(0, MAX_HTML_BYTES),
      headers: res.headers,
      url: res.url || url,
    };
  } catch {
    return null;
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/** Internal, same-origin, document-looking links from a page. */
export function internalLinks(html: string, origin: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*\bhref=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href))
      continue;
    let abs: URL;
    try {
      abs = new URL(href, origin);
    } catch {
      continue;
    }
    if (abs.origin !== new URL(origin).origin) continue;
    if (/\.(jpe?g|png|gif|webp|avif|svg|pdf|zip|mp4|css|js|xml)$/i.test(abs.pathname))
      continue;
    abs.hash = "";
    const key = abs.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** The first same-origin static asset referenced by the page, if any. */
function firstStaticAsset(html: string, origin: string): string | null {
  const re =
    /(?:src|href)=["']([^"']+\.(?:css|js|mjs|png|jpe?g|webp|avif|woff2?)(?:\?[^"']*)?)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const abs = new URL(m[1], origin);
      if (abs.origin === new URL(origin).origin) return abs.toString();
    } catch {
      /* skip */
    }
  }
  return null;
}

async function negotiatedAlpn(url: string): Promise<string | null> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.protocol !== "https:") return null;

  try {
    const tls = await import("node:tls");
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {
          /* already gone */
        }
        resolve(value);
      };
      const socket = tls.connect(
        {
          host: target.hostname,
          port: target.port ? Number(target.port) : 443,
          servername: target.hostname,
          ALPNProtocols: ["h2", "http/1.1"],
        },
        () => finish(socket.alpnProtocol || null),
      );
      socket.setTimeout(REQUEST_TIMEOUT_MS, () => finish(null));
      socket.on("error", () => finish(null));
    });
  } catch {
    return null;
  }
}

/**
 * One pass over the site: homepage, a few internal pages, robots.txt,
 * sitemap.xml, a static asset's headers, ALPN, and — only for stacks that
 * have one — a directory that should not be listable.
 *
 * Nothing here throws. Every field is independently nullable, and a check
 * that needs a field it did not get returns null, which keeps the task.
 */
export async function readSiteFacts(rawUrl: string): Promise<SiteFacts | null> {
  let base: URL;
  try {
    base = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return null;
  }

  const home = await getText(base.toString(), { headers: { accept: "text/html" } });
  const fetchedAt = new Date().toISOString();

  if (!home || home.status >= 400 || !home.body) {
    return {
      requestedUrl: base.toString(),
      finalUrl: home?.url ?? base.toString(),
      reachable: false,
      status: home?.status ?? 0,
      html: "",
      headers: home ? headersToObject(home.headers) : {},
      pages: [],
      robotsTxt: null,
      sitemap: null,
      directoryListing: null,
      staticAsset: null,
      alpn: null,
      httpsRedirect: null,
      fetchedAt,
    };
  }

  const origin = new URL(home.url).origin;
  const pages: PageSample[] = [
    { url: home.url, status: home.status, html: home.body },
  ];

  const candidates = internalLinks(home.body, home.url)
    .filter((u) => u !== home.url && u !== `${home.url}/`)
    .slice(0, MAX_SAMPLED_PAGES * 3);

  // Spread the sample across different path prefixes rather than taking
  // the first three links, which on most sites are all nav siblings.
  const picked: string[] = [];
  const seenPrefix = new Set<string>();
  for (const candidate of candidates) {
    if (picked.length >= MAX_SAMPLED_PAGES) break;
    const prefix = new URL(candidate).pathname.split("/").filter(Boolean)[0] ?? "";
    if (seenPrefix.has(prefix)) continue;
    seenPrefix.add(prefix);
    picked.push(candidate);
  }
  for (const candidate of candidates) {
    if (picked.length >= MAX_SAMPLED_PAGES) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }

  const looksWordPress = /wp-content|wp-includes|wp-json/i.test(home.body);
  const assetUrl = firstStaticAsset(home.body, home.url);

  const [sampled, robots, sitemapRes, asset, listing, alpn, httpProbe] =
    await Promise.all([
      Promise.all(
        picked.map((u) => getText(u, { headers: { accept: "text/html" } })),
      ),
      getText(new URL("/robots.txt", origin).toString()),
      getText(new URL("/sitemap.xml", origin).toString()),
      assetUrl ? getText(assetUrl) : Promise.resolve(null),
      looksWordPress
        ? getText(new URL("/wp-content/uploads/", origin).toString())
        : Promise.resolve(null),
      negotiatedAlpn(home.url),
      origin.startsWith("https://")
        ? getText(origin.replace(/^https:/, "http:"), { maxRedirects: 3 })
        : Promise.resolve(null),
    ]);

  for (let i = 0; i < sampled.length; i++) {
    const page = sampled[i];
    if (page && page.status < 400 && page.body) {
      pages.push({ url: page.url, status: page.status, html: page.body });
    }
  }

  const sitemapValid =
    !!sitemapRes &&
    sitemapRes.status === 200 &&
    /<(?:urlset|sitemapindex)\b/i.test(sitemapRes.body);

  return {
    requestedUrl: base.toString(),
    finalUrl: home.url,
    reachable: true,
    status: home.status,
    html: home.body,
    headers: headersToObject(home.headers),
    pages,
    robotsTxt: robots ? { status: robots.status, body: robots.body } : null,
    sitemap: sitemapRes
      ? {
          url: new URL("/sitemap.xml", origin).toString(),
          status: sitemapRes.status,
          valid: sitemapValid,
        }
      : null,
    directoryListing: listing
      ? {
          url: new URL("/wp-content/uploads/", origin).toString(),
          status: listing.status,
          isListing:
            listing.status === 200 &&
            /<title>\s*index of|>\s*parent directory\s*</i.test(listing.body),
        }
      : null,
    staticAsset: asset
      ? {
          url: asset.url,
          cacheControl: asset.headers.get("cache-control"),
        }
      : null,
    alpn,
    httpsRedirect: httpProbe ? httpProbe.url.startsWith("https://") : null,
    fetchedAt,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Reading one page
// ───────────────────────────────────────────────────────────────────────────

export function canonicalOf(html: string): string | null {
  const m =
    /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i.exec(html) ??
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']canonical["']/i.exec(html);
  return m ? m[1].trim() : null;
}

export function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta\\b[^>]*\\b(?:name|property)=["']${escaped}["'][^>]*\\bcontent=["']([^"']*)["']`,
    "i",
  );
  const m = re.exec(html);
  return m ? m[1].trim() : null;
}

/** Every @type in every JSON-LD block, including @graph members. */
export function jsonLdTypes(html: string): string[] {
  const out: string[] = [];
  const re =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const walk = (node: unknown, depth = 0) => {
      if (depth > 6 || node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      const record = node as Record<string, unknown>;
      const type = record["@type"];
      if (typeof type === "string") out.push(type);
      else if (Array.isArray(type))
        for (const t of type) if (typeof t === "string") out.push(t);
      const graph = record["@graph"];
      if (graph) walk(graph, depth + 1);
    };
    walk(parsed);
  }
  return out;
}

const BUSINESS_TYPES = new Set([
  "organization",
  "corporation",
  "localbusiness",
  "store",
  "onlinestore",
  "onlinebusiness",
  "restaurant",
  "professionalservice",
  "ngo",
  "educationalorganization",
  "governmentorganization",
  "medicalorganization",
  "sportsorganization",
  "performinggroup",
  "airline",
  "consortium",
  "cooperative",

]);

function hasBusinessType(types: string[]): string | null {
  for (const raw of types) {
    const t = raw.replace(/^https?:\/\/schema\.org\//i, "").toLowerCase();
    if (BUSINESS_TYPES.has(t)) return raw;
    // LocalBusiness has ~200 subtypes (Dentist, Plumber, HVACBusiness…)
    // that we are not going to enumerate. These suffixes catch the
    // commercial ones without matching Article or BreadcrumbList.
    if (/(business|store|shop|agency|service|clinic|dealer|market)$/i.test(t))
      return raw;
  }
  return null;
}

function imageSrcs(html: string): string[] {
  const out: string[] = [];
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function sample(f: SiteFacts): string {
  const n = f.pages.length;
  return n === 1 ? "the homepage" : `the homepage and ${n - 1} sampled page${n === 2 ? "" : "s"}`;
}

/** Passes only when every sampled page passes, and there is a sample. */
function everyPage(
  f: SiteFacts,
  predicate: (html: string) => boolean,
): boolean {
  return f.pages.length > 0 && f.pages.every((p) => predicate(p.html));
}

function headerMatches(f: SiteFacts, pattern: RegExp): string | null {
  for (const [key, value] of Object.entries(f.headers)) {
    if (pattern.test(key) || pattern.test(value)) return `${key}: ${value}`;
  }
  return null;
}

/**
 * The header a CDN or page cache uses to report what it did with this
 * request — cf-cache-status, x-hcdn-cache-status, x-cache, and friends.
 *
 * Its presence proves something is in front of the origin. Its *value*
 * decides whether anything was actually cached: DYNAMIC, MISS and BYPASS
 * all mean the origin rendered the page. Reading "a cache header exists"
 * as "caching is on" is the kind of confident wrong answer this file is
 * here to stop.
 */
function cacheStatusHeader(f: SiteFacts): { header: string; hit: boolean } | null {
  for (const [key, value] of Object.entries(f.headers)) {
    if (!/cache-status$|^x-cache$|^x-proxy-cache$|^x-litespeed-cache$/.test(key))
      continue;
    return { header: `${key}: ${value}`, hit: /\bhit\b/i.test(value) };
  }
  return null;
}

function maxAgeOf(cacheControl: string | null): number | null {
  if (!cacheControl) return null;
  const m = /\bmax-age\s*=\s*(\d+)/i.exec(cacheControl);
  return m ? Number(m[1]) : null;
}

// ───────────────────────────────────────────────────────────────────────────
// The checks, keyed by exact template title
// ───────────────────────────────────────────────────────────────────────────

const httpsCheck: Check = (f) => {
  if (!f.reachable || !f.finalUrl.startsWith("https://")) return null;
  if (f.httpsRedirect === false) return null;
  const mixed = f.pages.some((p) =>
    /(?:src|href)=["']http:\/\/(?!localhost)/i.test(p.html),
  );
  if (mixed) return null;
  return {
    done: true,
    evidence:
      f.httpsRedirect === true
        ? "HTTPS is live and plain http redirects to it; no http:// resources on the sampled pages"
        : "HTTPS is live and no http:// resources appear on the sampled pages",
  };
};

const jsonLdPresent: Check = (f) => {
  if (!f.reachable) return null;
  const types = jsonLdTypes(f.html);
  if (types.length === 0) return null;
  return {
    done: true,
    evidence: `JSON-LD already in the homepage head (${[...new Set(types)].slice(0, 4).join(", ")})`,
  };
};

const sitemapCheck: Check = (f) => {
  if (!f.sitemap?.valid) return null;
  const referenced = !!f.robotsTxt && /^\s*sitemap:/im.test(f.robotsTxt.body);
  return {
    done: true,
    evidence: referenced
      ? "sitemap.xml returns a valid urlset and robots.txt points to it (submission in Search Console not checked from here)"
      : "sitemap.xml returns a valid urlset (not referenced in robots.txt, and submission in Search Console not checked from here)",
  };
};

const CHECKS: Record<string, Check> = {
  // ── WordPress ──────────────────────────────────────────────────────────
  "Install Rank Math or Yoast SEO": (f) => {
    if (!f.reachable) return null;
    const yoast = /yoast|wpseo/i.test(f.html);
    const rankMath = /rank[- ]?math/i.test(f.html);
    const aioseo = /aioseo|all[- ]in[- ]one[- ]seo/i.test(f.html);
    const seopress = /seopress/i.test(f.html);
    if (!yoast && !rankMath && !aioseo && !seopress) return null;
    const name = yoast
      ? "Yoast"
      : rankMath
        ? "Rank Math"
        : aioseo
          ? "All in One SEO"
          : "SEOPress";
    return { done: true, evidence: `${name} is already emitting markup on the homepage` };
  },

  "Enable caching — install LiteSpeed Cache or WP Rocket": (f) => {
    if (!f.reachable) return null;
    const status = cacheStatusHeader(f);
    const markup = /wp-rocket|litespeed|wp-super-cache|w3-total-cache/i.exec(f.html);
    if (status?.hit) {
      return { done: true, evidence: `The homepage was served from cache — ${status.header}` };
    }
    if (markup) {
      return {
        done: true,
        evidence: `A cache plugin is already installed (${markup[0]} markup on the page)`,
      };
    }
    // A cache header saying DYNAMIC/MISS is not caching. Keep the task.
    return null;
  },

  "Install ShortPixel or Smush — convert images to WebP": (f) => {
    if (!f.reachable) return null;
    const srcs = imageSrcs(f.html);
    if (srcs.length < 4) return null;
    const modern = srcs.filter((s) => /\.(webp|avif)(\?|$)/i.test(s)).length;
    if (modern / srcs.length < 0.8) return null;
    return {
      done: true,
      evidence: `${modern} of ${srcs.length} homepage images are already WebP or AVIF`,
    };
  },

  "Set up Cloudflare (free tier) as a CDN": (f) => {
    if (!f.reachable) return null;
    const cf = f.headers["cf-ray"] ? `cf-ray: ${f.headers["cf-ray"]}` : null;
    const cloudflare = /cloudflare/i.test(f.headers["server"] ?? "")
      ? `server: ${f.headers["server"]}`
      : null;
    if (cf || cloudflare) {
      return {
        done: true,
        evidence: `Cloudflare is already in front of this site (${cf ?? cloudflare})`,
      };
    }
    // The task is "put a CDN in front of this", and another CDN satisfies
    // it. A cache-status header proves one is there even when it reports
    // a miss, because only a proxy sets that header at all.
    const other =
      headerMatches(
        f,
        /^(?:server|via)$|fastly|akamai|bunnycdn|keycdn|cloudfront|x-vercel-cache|x-amz-cf-id|hcdn/i,
      ) ?? null;
    const status = cacheStatusHeader(f);
    const named =
      other && /fastly|akamai|bunny|keycdn|cloudfront|vercel|hcdn|varnish/i.test(other)
        ? other
        : null;
    if (!named && !status) return null;
    return {
      done: true,
      evidence: `A CDN is already in front of this site (${named ?? status!.header})`,
    };
  },

  "Configure permalinks: Settings → Permalinks → Post name": (f) => {
    if (!f.reachable) return null;
    const links = f.pages.flatMap((p) => internalLinks(p.html, p.url));
    if (links.length < 5) return null;
    // The ?p=123 shortlink WordPress prints in every <head> is not a
    // permalink — only anchors count. This exact confusion shipped once
    // as a high-severity finding on a site with clean URLs.
    const ugly = links.filter((l) => /[?&](p|page_id|cat|product)=\d+/i.test(l));
    if (ugly.length > 0) return null;
    return {
      done: true,
      evidence: `All ${links.length} internal links found on ${sample(f)} use readable paths, not ?p= IDs`,
    };
  },

  "Disable directory indexing in .htaccess": (f) => {
    const listing = f.directoryListing;
    if (!listing) return null;
    if (listing.isListing) return null;
    if (listing.status === 200) return null;
    return {
      done: true,
      evidence: `${listing.url} answers ${listing.status}, so the uploads directory is not listable`,
    };
  },

  // ── Generic / custom stack ─────────────────────────────────────────────
  "Add canonical link tags to every page": (f) => {
    if (!f.reachable) return null;
    if (!everyPage(f, (html) => !!canonicalOf(html))) return null;
    return {
      done: true,
      evidence: `A rel=canonical tag is already present on ${sample(f)}`,
    };
  },

  "Generate and submit a sitemap.xml": sitemapCheck,
  "Add JSON-LD schema for your business type": (f) => {
    if (!f.reachable) return null;
    const match = hasBusinessType(jsonLdTypes(f.html));
    if (!match) return null;
    return {
      done: true,
      evidence: `The homepage already carries ${match} JSON-LD`,
    };
  },

  "Enable HTTP/2 or HTTP/3 + gzip/brotli compression": (f) => {
    if (!f.reachable) return null;
    const h3 = /h3/i.test(f.headers["alt-svc"] ?? "");
    const modern = f.alpn === "h2" || h3;
    const encoding = f.headers["content-encoding"];
    // fetch() decompresses and strips content-encoding, so its absence
    // proves nothing. Ask for it explicitly instead of guessing.
    if (!modern) return null;
    const protocol = h3 ? "HTTP/3 (alt-svc)" : "HTTP/2 (ALPN h2)";
    if (!encoding) {
      return {
        done: true,
        evidence: `${protocol} is already negotiated; compression not separately confirmed`,
      };
    }
    return {
      done: true,
      evidence: `${protocol} is already negotiated and responses arrive ${encoding}-compressed`,
    };
  },

  "Configure proper cache-control headers for static assets": (f) => {
    const asset = f.staticAsset;
    if (!asset?.cacheControl) return null;
    const maxAge = maxAgeOf(asset.cacheControl);
    if (maxAge === null || maxAge < 86_400) return null;
    const days = Math.round(maxAge / 86_400);
    return {
      done: true,
      evidence: `Static assets already send cache-control: ${asset.cacheControl} (${days} day${days === 1 ? "" : "s"})`,
    };
  },

  // ── Squarespace / Webflow ──────────────────────────────────────────────
  "Enable HTTPS in Settings → Advanced → SSL": httpsCheck,
  "Enable site-wide HTTPS in Project Settings → Hosting": httpsCheck,
  "Add JSON-LD via Page Settings → Custom Code → Inside <head>": jsonLdPresent,

  "Set up Open Graph and Twitter Card images on every page": (f) => {
    if (!f.reachable) return null;
    const ok = everyPage(
      f,
      (html) =>
        !!metaContent(html, "og:image") &&
        (!!metaContent(html, "twitter:card") || !!metaContent(html, "twitter:image")),
    );
    if (!ok) return null;
    return {
      done: true,
      evidence: `og:image and Twitter Card tags are already set on ${sample(f)}`,
    };
  },

  // ── Next.js ────────────────────────────────────────────────────────────
  "Add app/sitemap.ts and app/robots.ts": (f) => {
    if (!f.sitemap?.valid) return null;
    if (!f.robotsTxt || f.robotsTxt.status !== 200) return null;
    if (!/user-agent:/i.test(f.robotsTxt.body)) return null;
    return {
      done: true,
      evidence: "Both /robots.txt and a valid /sitemap.xml are already served",
    };
  },

  "Replace <img> with next/image throughout": (f) => {
    if (!f.reachable) return null;
    const all = f.pages.flatMap((p) => imageSrcs(p.html));
    if (all.length < 3) return null;
    const optimized = all.filter((s) => s.includes("/_next/image"));
    if (optimized.length !== all.length) return null;
    return {
      done: true,
      evidence: `All ${all.length} images on ${sample(f)} are served through next/image`,
    };
  },

  "Preload critical fonts with next/font": (f) => {
    if (!f.reachable) return null;
    const preloads =
      f.html.match(/<link\b[^>]*rel=["']preload["'][^>]*as=["']font["'][^>]*>/gi) ?? [];
    if (preloads.length === 0) return null;
    const viaNextFont = preloads.some((tag) => /\/_next\/static\/media\//.test(tag));
    if (!viaNextFont) return null;
    return {
      done: true,
      evidence: `${preloads.length} font${preloads.length === 1 ? " is" : "s are"} already preloaded via next/font`,
    };
  },

  // ── Niche templates ────────────────────────────────────────────────────
  "Add LocalBusiness schema to your homepage": (f) => {
    if (!f.reachable) return null;
    const types = jsonLdTypes(f.html);
    const match = types.find((t) =>
      /localbusiness|(business|store|shop|restaurant|clinic|dealer)$/i.test(
        t.replace(/^https?:\/\/schema\.org\//i, ""),
      ),
    );
    if (!match) return null;
    return { done: true, evidence: `The homepage already carries ${match} JSON-LD` };
  },

  "Write SoftwareApplication schema for your homepage": (f) => {
    if (!f.reachable) return null;
    const match = jsonLdTypes(f.html).find((t) =>
      /^(?:https?:\/\/schema\.org\/)?(?:softwareapplication|webapplication|mobileapplication)$/i.test(
        t,
      ),
    );
    if (!match) return null;
    return { done: true, evidence: `The homepage already carries ${match} JSON-LD` };
  },

  "Set up clean breadcrumb navigation with schema": (f) => {
    // The homepage is the root of the trail and legitimately has none, so
    // this needs an inner page to say anything.
    const inner = f.pages.slice(1);
    if (inner.length === 0) return null;
    const withCrumbs = inner.filter((p) =>
      jsonLdTypes(p.html).some((t) => /breadcrumblist/i.test(t)),
    );
    if (withCrumbs.length !== inner.length) return null;
    return {
      done: true,
      evidence: `BreadcrumbList JSON-LD is already present on ${inner.length} sampled inner page${inner.length === 1 ? "" : "s"}`,
    };
  },
};

/** Exact template titles this module can check. Used by the drift test. */
export const CHECKED_TEMPLATE_TITLES = Object.keys(CHECKS);

/**
 * Is this template already satisfied by the live site? null means keep it.
 */
export function templateSatisfied(
  title: string,
  facts: SiteFacts | null,
): TemplateVerdict | null {
  if (!facts || !facts.reachable) return null;
  const check = CHECKS[title];
  if (!check) return null;
  try {
    return check(facts);
  } catch {
    // A parsing failure means we do not know, which means keep the task.
    return null;
  }
}

/**
 * Split templates into the ones worth creating and the ones the site has
 * already done. With no facts, everything is kept — the pre-existing
 * behaviour.
 */
export function splitTemplatesByState<T extends { title: string }>(
  templates: readonly T[],
  facts: SiteFacts | null,
): { keep: T[]; alreadyDone: { title: string; evidence: string }[] } {
  const keep: T[] = [];
  const alreadyDone: { title: string; evidence: string }[] = [];
  for (const template of templates) {
    const verdict = templateSatisfied(template.title, facts);
    if (verdict) alreadyDone.push({ title: template.title, evidence: verdict.evidence });
    else keep.push(template);
  }
  return { keep, alreadyDone };
}
