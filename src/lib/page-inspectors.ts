/**
 * Suite of single-page inspectors that share a fetch step. Each one returns
 * a focused result for one tool:
 *
 *   - validateSchemaFromUrl   → live JSON-LD validation
 *   - extractSocialPreviews   → OG + Twitter card data
 *   - checkMobileFriendliness → viewport, font sizes, touch targets, intrusive interstitial
 *   - extractAnchorDistribution → anchor text frequency, internal vs external
 */

import { guardedFetch } from "./url-guard";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

async function fetchHtml(url: string): Promise<string | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await guardedFetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) return null;
    return (await res.text()).slice(0, 1_500_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// =============== Schema validator ===============

export type SchemaBlock = {
  raw: string;
  parsed: unknown;
  type: string | string[] | null;
  errors: string[];
  warnings: string[];
};

export type SchemaValidationResult = {
  ok: boolean;
  url: string;
  blocks: SchemaBlock[];
  totalErrors: number;
  totalWarnings: number;
  error?: string;
};

const REQUIRED_FIELDS: Record<string, string[]> = {
  Article: ["headline", "author", "datePublished"],
  NewsArticle: ["headline", "author", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  Product: ["name", "image", "offers"],
  Recipe: ["name", "recipeIngredient", "recipeInstructions"],
  Event: ["name", "startDate", "location"],
  Organization: ["name", "url"],
  LocalBusiness: ["name", "address"],
  Person: ["name"],
  FAQPage: ["mainEntity"],
  HowTo: ["name", "step"],
  VideoObject: ["name", "thumbnailUrl", "uploadDate"],
  Review: ["itemReviewed", "reviewRating", "author"],
  BreadcrumbList: ["itemListElement"],
};

export async function validateSchemaFromUrl(
  url: string,
): Promise<SchemaValidationResult> {
  const html = await fetchHtml(url);
  if (!html) {
    return {
      ok: false,
      url,
      blocks: [],
      totalErrors: 0,
      totalWarnings: 0,
      error: "Couldn't fetch the page.",
    };
  }
  const blocks: SchemaBlock[] = [];
  for (const m of html.matchAll(
    /<script\s[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const raw = m[1].trim();
    const errors: string[] = [];
    const warnings: string[] = [];
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      errors.push(`Invalid JSON: ${(err as Error).message}`);
      blocks.push({ raw, parsed: null, type: null, errors, warnings });
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    let firstType: string | string[] | null = null;
    for (const item of items) {
      if (!item || typeof item !== "object") {
        errors.push("Schema item is not an object.");
        continue;
      }
      const o = item as Record<string, unknown>;
      const ctx = o["@context"];
      if (!ctx || !/schema\.org/i.test(String(ctx))) {
        warnings.push("Missing or non-standard @context (expected https://schema.org).");
      }
      const type = o["@type"];
      if (!type) {
        errors.push("Missing @type.");
        continue;
      }
      const typeStr = Array.isArray(type) ? type[0] : String(type);
      if (!firstType) firstType = type as string | string[];
      const required = REQUIRED_FIELDS[typeStr];
      if (required) {
        for (const field of required) {
          if (!(field in o) || o[field] === "" || o[field] === null) {
            errors.push(`${typeStr} missing required field: ${field}`);
          }
        }
      }
      // Common pitfalls
      if (typeStr === "Article" || typeStr === "NewsArticle" || typeStr === "BlogPosting") {
        if (!o["mainEntityOfPage"] && !o["url"]) {
          warnings.push(`${typeStr}: add 'mainEntityOfPage' or 'url' for canonical clarity.`);
        }
        if (!o["dateModified"]) {
          warnings.push(`${typeStr}: 'dateModified' missing — Google rewards demonstrable freshness.`);
        }
        if (!o["image"]) {
          warnings.push(`${typeStr}: 'image' missing.`);
        }
      }
      if (typeStr === "Product") {
        const offers = o["offers"];
        if (offers && typeof offers === "object") {
          const oo = offers as Record<string, unknown>;
          if (!oo["price"] && !oo["lowPrice"]) {
            errors.push("Product.offers: 'price' (or lowPrice) required.");
          }
          if (!oo["priceCurrency"]) {
            errors.push("Product.offers: 'priceCurrency' required.");
          }
        }
      }
    }
    blocks.push({ raw, parsed, type: firstType, errors, warnings });
  }

  return {
    ok: true,
    url,
    blocks,
    totalErrors: blocks.reduce((s, b) => s + b.errors.length, 0),
    totalWarnings: blocks.reduce((s, b) => s + b.warnings.length, 0),
  };
}

// =============== Social previews ===============

export type SocialPreview = {
  ok: boolean;
  url: string;
  /** What appears in Facebook / LinkedIn / Slack. */
  og: {
    title: string | null;
    description: string | null;
    image: string | null;
    type: string | null;
    siteName: string | null;
    url: string | null;
  };
  /** What appears in X / Twitter. */
  twitter: {
    card: string | null;
    title: string | null;
    description: string | null;
    image: string | null;
    site: string | null;
    creator: string | null;
  };
  warnings: string[];
  error?: string;
};

export async function extractSocialPreviews(url: string): Promise<SocialPreview> {
  const html = await fetchHtml(url);
  if (!html) {
    return emptySocial(url, "Couldn't fetch the page.");
  }
  const get = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null;
  const og = {
    title: get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i),
    description: get(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i,
    ),
    image: get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i),
    type: get(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)/i),
    siteName: get(
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i,
    ),
    url: get(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i),
  };
  const twitter = {
    card: get(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']+)/i),
    title: get(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)/i),
    description: get(
      /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)/i,
    ),
    image: get(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i),
    site: get(/<meta[^>]+name=["']twitter:site["'][^>]+content=["']([^"']+)/i),
    creator: get(/<meta[^>]+name=["']twitter:creator["'][^>]+content=["']([^"']+)/i),
  };

  const warnings: string[] = [];
  if (!og.title) warnings.push("og:title missing — social shares will fall back to <title>, which is often wrong.");
  if (!og.description) warnings.push("og:description missing.");
  if (!og.image)
    warnings.push("og:image missing — share previews will be image-less, killing CTR.");
  if (og.image && og.image.startsWith("/"))
    warnings.push("og:image is a relative URL — Facebook requires absolute URLs.");
  if (!twitter.card) warnings.push("twitter:card missing — defaulting to summary (smaller card).");
  if (!twitter.title && !og.title) warnings.push("Neither twitter:title nor og:title set.");

  return {
    ok: true,
    url,
    og,
    twitter,
    warnings,
  };
}

function emptySocial(url: string, error: string): SocialPreview {
  return {
    ok: false,
    url,
    og: {
      title: null,
      description: null,
      image: null,
      type: null,
      siteName: null,
      url: null,
    },
    twitter: {
      card: null,
      title: null,
      description: null,
      image: null,
      site: null,
      creator: null,
    },
    warnings: [],
    error,
  };
}

// =============== Mobile-friendly checker ===============

export type MobileFriendlyCheck = {
  ok: boolean;
  url: string;
  hasViewport: boolean;
  viewport: string | null;
  /** True if viewport is properly sized for mobile (width=device-width). */
  viewportSane: boolean;
  hasResponsiveImages: boolean;
  imageCount: number;
  /** Body uses a font-size that's mobile-readable. */
  hasReadableFontHints: boolean;
  /** Page declares charset. */
  hasCharset: boolean;
  /** Tap targets — count of buttons/anchors with no explicit min-size. We can only
   *  detect this heuristically without actually rendering. */
  potentialTapTargetIssues: number;
  /** Fixed-width body / table elements that won't reflow. */
  fixedWidthElements: number;
  /** Intrusive interstitials we can heuristically detect. */
  hasInterstitial: boolean;
  warnings: string[];
  error?: string;
};

export async function checkMobileFriendliness(
  url: string,
): Promise<MobileFriendlyCheck> {
  const html = await fetchHtml(url);
  if (!html) {
    return emptyMobile(url, "Couldn't fetch the page.");
  }
  const viewportM = html.match(
    /<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)/i,
  );
  const viewport = viewportM?.[1] ?? null;
  const viewportSane =
    !!viewport &&
    /width=device-width/i.test(viewport) &&
    !/initial-scale=0\.|maximum-scale=1\b.*user-scalable=no/i.test(viewport);

  const charsetM = html.match(/<meta[^>]+charset/i);
  const hasCharset = !!charsetM;

  const imageCount = (html.match(/<img\b/gi) ?? []).length;
  const responsiveImages =
    /\bsrcset=/i.test(html) || /class=["'][^"']*(responsive|img-fluid)/i.test(html);

  const hasReadableFontHints =
    /(font-size:\s*1[6-9]px|font-size:\s*[2-9]\d+px|font-size:\s*1\.\d+rem)/i.test(html);

  const fixedWidthElements = (html.match(/style=["'][^"']*width:\s*\d{3,4}px/gi) ?? []).length;

  // Buttons/anchors with explicit small height styling
  const potentialTapTargetIssues = (
    html.match(/style=["'][^"']*height:\s*(?:1\d|2[0-3])px/gi) ?? []
  ).length;

  // Common interstitial patterns
  const hasInterstitial =
    /class=["'][^"']*(modal|popup|interstitial|cookie-banner|consent-modal|gdpr|newsletter-popup)/i.test(
      html,
    );

  const warnings: string[] = [];
  if (!viewport)
    warnings.push("No viewport meta — page will render at desktop width on mobile and require pinch-zoom.");
  else if (!viewportSane) {
    if (/initial-scale=0\./i.test(viewport))
      warnings.push("viewport initial-scale is below 1.0 — this zooms out the page on load.");
    if (/user-scalable=no/i.test(viewport))
      warnings.push("user-scalable=no — accessibility violation. Remove it.");
  }
  if (!hasCharset) warnings.push("No charset declaration — non-ASCII content may render incorrectly.");
  if (imageCount > 0 && !responsiveImages)
    warnings.push("No srcset or responsive image classes detected — images may overflow on mobile.");
  if (fixedWidthElements > 3)
    warnings.push(`${fixedWidthElements} elements with fixed pixel widths — these break responsive layout.`);
  if (potentialTapTargetIssues > 5)
    warnings.push(
      `${potentialTapTargetIssues} potential small tap targets (height ≤24px) — Google requires ≥48×48px.`,
    );

  return {
    ok: true,
    url,
    hasViewport: !!viewport,
    viewport,
    viewportSane,
    hasResponsiveImages: responsiveImages,
    imageCount,
    hasReadableFontHints,
    hasCharset,
    potentialTapTargetIssues,
    fixedWidthElements,
    hasInterstitial,
    warnings,
  };
}

function emptyMobile(url: string, error: string): MobileFriendlyCheck {
  return {
    ok: false,
    url,
    hasViewport: false,
    viewport: null,
    viewportSane: false,
    hasResponsiveImages: false,
    imageCount: 0,
    hasReadableFontHints: false,
    hasCharset: false,
    potentialTapTargetIssues: 0,
    fixedWidthElements: 0,
    hasInterstitial: false,
    warnings: [],
    error,
  };
}

// =============== Anchor text distribution ===============

export type AnchorDistribution = {
  ok: boolean;
  url: string;
  totalAnchors: number;
  internal: { anchor: string; href: string; count: number }[];
  external: { anchor: string; href: string; count: number }[];
  topAnchorTerms: { term: string; count: number }[];
  exactMatchPct: number;
  brandedPct: number;
  warnings: string[];
  error?: string;
};

export async function extractAnchorDistribution(opts: {
  url: string;
  brandTerms?: string[];
  exactMatchTerms?: string[];
}): Promise<AnchorDistribution> {
  const html = await fetchHtml(opts.url);
  if (!html) {
    return {
      ok: false,
      url: opts.url,
      totalAnchors: 0,
      internal: [],
      external: [],
      topAnchorTerms: [],
      exactMatchPct: 0,
      brandedPct: 0,
      warnings: [],
      error: "Couldn't fetch the page.",
    };
  }
  let host = "";
  try {
    host = new URL(opts.url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    // ignore
  }

  const anchors: { anchor: string; href: string; isInternal: boolean }[] = [];
  for (const m of html.matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const href = m[1].trim();
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) continue;
    const text = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    let absolute: URL | null = null;
    try {
      absolute = new URL(href, opts.url);
    } catch {
      continue;
    }
    const linkHost = absolute.hostname.replace(/^www\./i, "").toLowerCase();
    const isInternal = Boolean(
      host && (linkHost === host || linkHost.endsWith(`.${host}`)),
    );
    anchors.push({ anchor: text.slice(0, 200), href: absolute.toString(), isInternal });
  }

  const intMap = new Map<string, { anchor: string; href: string; count: number }>();
  const extMap = new Map<string, { anchor: string; href: string; count: number }>();
  const termCounts = new Map<string, number>();
  for (const a of anchors) {
    const k = `${a.anchor}|${a.href}`;
    const target = a.isInternal ? intMap : extMap;
    const cur = target.get(k) ?? { anchor: a.anchor, href: a.href, count: 0 };
    cur.count += 1;
    target.set(k, cur);

    const lower = a.anchor.toLowerCase();
    termCounts.set(lower, (termCounts.get(lower) ?? 0) + 1);
  }

  const total = anchors.length;
  const exactMatch = (opts.exactMatchTerms ?? []).flatMap((t) => t.toLowerCase().trim());
  const brand = (opts.brandTerms ?? []).flatMap((t) => t.toLowerCase().trim());

  let exactCount = 0;
  let brandCount = 0;
  for (const a of anchors) {
    const lower = a.anchor.toLowerCase();
    if (exactMatch.some((t) => t && lower === t)) exactCount += 1;
    if (brand.some((t) => t && lower.includes(t))) brandCount += 1;
  }

  const topAnchorTerms = Array.from(termCounts.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const warnings: string[] = [];
  if (total === 0) warnings.push("No anchors found on the page.");
  const exactPct = total > 0 ? (exactCount / total) * 100 : 0;
  if (exactMatch.length > 0 && exactPct > 5)
    warnings.push(
      `${exactPct.toFixed(1)}% exact-match anchors — over-optimization risk. Aim for <5%.`,
    );
  const internalShare = (Array.from(intMap.values()).reduce((s, r) => s + r.count, 0) /
    Math.max(1, total)) * 100;
  if (total >= 10 && internalShare < 30)
    warnings.push(
      `Only ${internalShare.toFixed(0)}% of anchors are internal. Pages with sparse internal linking get less PageRank.`,
    );

  return {
    ok: true,
    url: opts.url,
    totalAnchors: total,
    internal: Array.from(intMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    external: Array.from(extMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 30),
    topAnchorTerms,
    exactMatchPct: exactPct,
    brandedPct: total > 0 ? (brandCount / total) * 100 : 0,
    warnings,
  };
}
