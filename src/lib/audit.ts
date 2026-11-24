import { findFacetTrap, findStaleContent, STALE_AFTER_MONTHS } from "./audit-site-checks";
import { getReportLocale } from "./report-i18n";
import {
  ALLOW_ALL,
  fetchRobotsPolicy,
  isAllowed,
} from "./robots-policy";
import { guardedFetch, guardUrl } from "./url-guard";
import { isInfrastructureUrl } from "./infrastructure-urls";

export type Severity = "critical" | "high" | "medium" | "low";

export type AuditFinding = {
  type: string;
  severity: Severity;
  message: string;
  url: string;
  /** Engine category id, for findings from the rule engine. */
  category?: string;
  /** How to fix it, for findings from the rule engine. */
  fixSteps?: string | null;
  /** Set by the rule engine; SEO Tool's checks get theirs from audit-confidence. */
  confidence?: "definitely" | "probably" | "test";
};

export type AuditResult = {
  url: string;
  finalUrl: string;
  status: number;
  fetchedAt: Date;
  pagesCrawled: number;
  findings: AuditFinding[];
  /** Every address the crawl read (requested and final), so a task can tell a fixed page from an unvisited one. */
  crawledUrls?: string[];
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

/**
 * Language of the finding messages, set once per audit by runAudit from
 * the workspace language: the messages are stored and shown as written,
 * in tasks, reports and the client's portal, the way task titles are.
 * Module-wide like report-generator's strings; the workspace has one
 * language, so concurrent audits agree on it.
 */
let FR = false;
const tr = (en: string, fr: string): string => (FR ? fr : en);

/** For tests and callers that audit outside a request. */
export function setAuditLanguage(locale: string): void {
  FR = locale === "fr";
}

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

// Moved to its own module. Reaching it through the crawler dragged the
// Playwright browser pool into keyword discovery, which the generated
// capability table caught by marking a keyword read as a browser job.
export { isInfrastructureUrl } from "./infrastructure-urls";

function extractHrefs(html: string, baseUrl: string): string[] {
  const re = /<a\s+[^>]*href=["']([^"']+)["']/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1], baseUrl);
      // Infrastructure, not content. Dropped here rather than later so
      // it never reaches the crawl queue or the broken-link check.
      if (isInfrastructureUrl(abs.toString())) continue;
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

/**
 * Is the heading outline sound?
 *
 * Two ways it can be wrong, and this used to catch only the first:
 *
 *   - the page opens on something other than an <h1>
 *   - a level is skipped on the way down, h1 straight to h4
 *
 * The second is the commoner mistake by a distance — it comes from
 * picking a heading for how big it looks — and it was invisible here. A
 * fixture page with exactly that shape was reported clean, which is how
 * the gap was found: the check's name promised an outline and it only
 * ever looked at the first tag.
 *
 * Going back UP any number of levels is fine. h4 to h2 starts a new
 * section; it does not skip anything.
 */
function checkHeadingOrder(html: string): boolean {
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  if (levels.length === 0) return true;
  if (levels[0] !== 1) return false;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) return false;
  }
  return true;
}

export type FetchedPage = {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  headers: Headers;
  responseTimeMs: number;
  redirectHops: number;
  /** True when `html` came from a headless browser, not the raw fetch. */
  renderedWithJs?: boolean;
};

async function fetchPage(
  url: string,
  timeoutMs = 12_000,
  allowPrivate = false,
): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    // guardedFetch, not fetch: `url` comes from a user-typed address
    // and from hrefs discovered on the crawled page, so the server is
    // being asked to connect wherever those point. Without this a
    // crawl could be steered at 169.254.169.254 (cloud credentials) or
    // at services on the host, and redirects are re-checked per hop
    // because "public URL that 302s somewhere internal" is the usual
    // bypass.
    const res = await guardedFetch(url, {
      allowPrivate,
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

/** The site asks us to slow down; says nothing about the page. */
export function isThrottled(status: number): boolean {
  return status === 429 || status === 503;
}

const THROTTLE_WAIT_MS = 2_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchUrlStatus(
  url: string,
  timeoutMs = 8_000,
  allowPrivate = false,
): Promise<{ status: number; finalUrl: string } | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // allowPrivate was missing here while every other fetch in this file
    // threaded it. The guard rejected the request, the catch below turned
    // that into null, and null reads as "not broken" — so on the private
    // hosts that option exists to support (a staging box, a LAN address,
    // a docker hostname) broken-link checking silently found nothing at
    // all. No error, no empty result, just a check that never ran.
    const res = await guardedFetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT },
      allowPrivate,
    });
    // Some servers refuse HEAD (405, 501) on pages that load fine: ask
    // again with GET before calling the link broken. Only the status is
    // needed, so the body is dropped unread.
    if (res.status === 405 || res.status === 501) {
      const get = await guardedFetch(url, {
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT },
        allowPrivate,
      });
      await get.body?.cancel().catch(() => {});
      return { status: get.status, finalUrl: get.url };
    }
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
  allowPrivate = false,
): Promise<{ status: number; text: string } | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await guardedFetch(url, {
      allowPrivate,
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

/**
 * Finding types produced by `checkPage`, one page at a time.
 *
 * Only these (and the per-technology ones below) can be confirmed by
 * re-fetching a single URL. Everything else compares pages with each
 * other (duplicate titles, orphan pages) or describes the whole site
 * (sitemap, robots.txt, security headers): re-checking one page would
 * report it "gone" simply because the check that finds it never ran.
 * audit.recheck.test.ts reads checkPage's source to keep this honest.
 */
export const PAGE_CHECK_TYPES: readonly string[] = [
  "article_missing_author",
  "bad_status",
  "heading_order",
  "heavy_html_payload",
  "image_missing_dimensions",
  "invalid_canonical",
  "js_rendered_only",
  "long_meta_description",
  "long_title",
  "missing_canonical",
  "missing_favicon",
  "missing_h1",
  "missing_image_alt",
  "missing_lang",
  "missing_meta_description",
  "missing_og_tags",
  "missing_schema",
  "missing_title",
  "missing_twitter_card",
  "missing_viewport",
  "mixed_content",
  "no_https",
  "noindex_set",
  "no_lazy_loading",
  "non_self_canonical",
  "old_image_formats",
  "render_blocking_scripts",
  "short_meta_description",
  "short_title",
  "slow_response",
  "soft_404",
  "thin_content",
  "viewport_blocks_zoom",
  "weak_anchor_text",
  "xrobots_noindex",
];

/** Per-technology checks (tech-audit-rules.ts), also run on each page. */
export const TECH_PAGE_CHECK_TYPES: readonly string[] = [
  "next_chunk_explosion",
  "next_powered_by_header",
  "next_raw_img_tags",
  "shopify_collections_all",
  "shopify_liquid_debug",
  "spa_empty_body",
  "wp_author_archive_indexed",
  "wp_default_permalinks",
  "wp_emoji_bloat",
  "wp_heartbeat_on_frontend",
  "wp_missing_block_styles",
  "wp_multiple_seo_plugins",
  "wp_plugin_bloat",
  "wp_rest_api_advertised",
  "wp_version_disclosed",
  "wp_xmlrpc_exposed",
];

const PAGE_TYPES = new Set(PAGE_CHECK_TYPES);
const TECH_TYPES = new Set(TECH_PAGE_CHECK_TYPES);

/** True when a finding of this type can be confirmed on its page alone. */
export function isPageRecheckable(type: string): boolean {
  return PAGE_TYPES.has(type) || TECH_TYPES.has(type);
}

/** True for the per-technology finding types. */
export function isTechPageCheck(type: string): boolean {
  return TECH_TYPES.has(type);
}

export type RecheckResult = {
  findings: AuditFinding[];
  meta: { title: string | null; description: string | null };
  /** Status and address actually served, so a caller can refuse to read
   * "gone" off an error page or a redirect to some other page. */
  status: number;
  finalUrl: string;
  /** False when technology detection failed: the per-technology checks
   * did not run, and their absence proves nothing. */
  techChecked: boolean;
};

/**
 * Re-run the per-page checks on ONE live URL.
 *
 * Exists to close the loop on a fix (lib/agent/close-loop.ts). When the
 * agent writes a title, the executor reads the field back out of the CMS
 * and records the action `verified`. That proves the CMS stored the
 * value. It does NOT prove the page a crawler fetches has changed — a
 * full-page cache, a CDN, a theme overriding the field or an SEO plugin
 * templating the title will all keep serving the old one. So a finding
 * is only resolved once the live page agrees.
 *
 * The same checks as the crawl, page by page: the raw fetch, the
 * headless render when the page looks client-side (as runAudit does),
 * then checkPage and the per-technology checks.
 *
 * Deliberately NOT runAudit with maxPages 1: that writes an audit row,
 * fetches robots.txt and the sitemap, and would pollute the audit
 * history with a row per fix.
 *
 * Returns null when the page could not be fetched at all — which is not
 * the same as "the finding is gone", and callers must not treat it so.
 */
export async function recheckUrl(
  url: string,
  options: {
    allowPrivateHosts?: boolean;
    /** Technologies already detected for this site (several pages of the
     * same site re-checked in a row): skips detecting them again. */
    techNames?: string[];
  } = {},
): Promise<RecheckResult | null> {
  const allowPrivate = options.allowPrivateHosts ?? false;
  const fetched = await fetchPage(url, 15_000, allowPrivate);
  if (!fetched) return null;
  const page = await renderIfClientSide(fetched);
  const r = checkPage(page);
  const findings = [...r.findings];
  let techChecked = false;
  try {
    const { classifyTech, runTechSpecificChecks } = await import("./tech-audit-rules");
    let techNames: string[];
    if (options.techNames) {
      techNames = options.techNames;
    } else {
      const { detectTechStack } = await import("./tech-detect");
      const detected = await detectTechStack(new URL(page.finalUrl).origin + "/", allowPrivate);
      techNames = detected.technologies.map((t) => t.name);
    }
    for (const tf of runTechSpecificChecks({
      url: page.finalUrl,
      html: page.html,
      headers: page.headers,
      tech: classifyTech(techNames),
      fr: FR,
    })) {
      findings.push({ type: tf.type, severity: tf.severity, url: tf.url, message: `[${tf.tech}] ${tf.message}` });
    }
    techChecked = true;
  } catch {
    // Detection failed: only the generic checks ran.
  }
  return { findings, meta: r.meta, status: page.status, finalUrl: page.finalUrl, techChecked };
}

// ───────────────────────────────────────────────────────────────────────────
// Per-page checks
// ───────────────────────────────────────────────────────────────────────────

/**
 * Every per-page check, on one already-fetched page.
 *
 * Exported for tests. Most of what this produces is covered by the
 * fixture site, which is the better test because it exercises the real
 * crawl — but a handful of checks need conditions the fixture server
 * cannot create. mixed_content only fires on an HTTPS page, and giving
 * the fixture server TLS means a certificate on every machine that runs
 * the suite, for one rule.
 */
export function checkPage(page: FetchedPage): {
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
      message: tr(`Server returned HTTP ${page.status} on ${url}.`, `Le serveur a renvoyé HTTP ${page.status} sur ${url}.`),
    });
  }

  if (!page.finalUrl.startsWith("https://")) {
    findings.push({
      type: "no_https",
      severity: "critical",
      url,
      message: tr("Page is not served over HTTPS.", "La page n’est pas servie en HTTPS."),
    });
  }

  if (page.responseTimeMs > 2_000) {
    findings.push({
      type: "slow_response",
      severity: "medium",
      url,
      message: tr(`Server responded in ${page.responseTimeMs}ms — aim for under 800ms.`, `Le serveur a répondu en ${page.responseTimeMs} ms : visez moins de 800 ms.`),
    });
  }

  // Title checks
  const title = extractTitle(html);
  if (!title) {
    findings.push({
      type: "missing_title",
      severity: "critical",
      url,
      message: tr("Missing <title> tag.", "Balise <title> absente."),
    });
  } else if (title.length < 10) {
    findings.push({
      type: "short_title",
      severity: "high",
      url,
      message: tr(`Title is only ${title.length} characters — aim for 50–60.`, `Le title ne fait que ${title.length} caractères : visez 50 à 60.`),
    });
  } else if (title.length > 60) {
    findings.push({
      type: "long_title",
      severity: "medium",
      url,
      message: tr(`Title is ${title.length} characters — Google may truncate beyond ~60.`, `Le title fait ${title.length} caractères : Google peut le couper au-delà d’environ 60.`),
    });
  }

  // Meta description
  const description = extractMeta(html, "description");
  if (!description) {
    findings.push({
      type: "missing_meta_description",
      severity: "high",
      url,
      message: tr("Missing meta description.", "Méta-description absente."),
    });
  } else if (description.length < 50) {
    findings.push({
      type: "short_meta_description",
      severity: "medium",
      url,
      message: tr(`Meta description is ${description.length} characters — aim for 120–155.`, `La méta-description fait ${description.length} caractères : visez 120 à 155.`),
    });
  } else if (description.length > 160) {
    findings.push({
      type: "long_meta_description",
      severity: "low",
      url,
      message: tr(`Meta description is ${description.length} characters — may truncate beyond ~160.`, `La méta-description fait ${description.length} caractères : elle peut être coupée au-delà d’environ 160.`),
    });
  }

  // H1
  const h1s = extractAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (h1s.length === 0) {
    findings.push({
      type: "missing_h1",
      severity: "high",
      url,
      message: tr("No <h1> heading on the page.", "Aucun titre <h1> sur la page."),
    });
  }

  // Heading order
  if (!checkHeadingOrder(html)) {
    findings.push({
      type: "heading_order",
      severity: "low",
      url,
      message:
        tr("The heading outline is broken — either the page doesn't open on an <h1>, or it skips a level (an <h1> straight to an <h4>). Screen readers navigate by this outline.", "La hiérarchie des titres est rompue : la page ne commence pas par un <h1>, ou saute un niveau (d’un <h1> directement à un <h4>). Les lecteurs d’écran naviguent par cette hiérarchie."),
    });
  }

  // Canonical
  if (!extractLink(html, "canonical")) {
    findings.push({
      type: "missing_canonical",
      severity: "medium",
      url,
      message: tr("Missing <link rel='canonical'>.", "Balise <link rel='canonical'> absente."),
    });
  }

  // Viewport
  if (!extractMeta(html, "viewport")) {
    findings.push({
      type: "missing_viewport",
      severity: "high",
      url,
      message: tr("No viewport meta — page won't render correctly on mobile.", "Pas de balise meta viewport : la page ne s’affichera pas correctement sur mobile."),
    });
  }

  // Robots / noindex
  const robots = extractMeta(html, "robots");
  if (robots && /noindex/i.test(robots)) {
    findings.push({
      type: "noindex_set",
      severity: "critical",
      url,
      message: tr("Page has noindex set — Google will not index it.", "La page est en noindex : Google ne l’indexera pas."),
    });
  }

  // Lang
  if (!/<html[^>]+lang=["'][^"']+["']/i.test(html)) {
    findings.push({
      type: "missing_lang",
      severity: "low",
      url,
      message: tr("No lang attribute on <html>.", "Pas d’attribut lang sur <html>."),
    });
  }

  // Favicon
  if (!extractLink(html, "icon") && !extractLink(html, "shortcut icon")) {
    findings.push({
      type: "missing_favicon",
      severity: "low",
      url,
      message: tr("No favicon link.", "Pas de lien vers un favicon."),
    });
  }

  // OpenGraph
  if (!extractMeta(html, "og:title", "property")) {
    findings.push({
      type: "missing_og_tags",
      severity: "low",
      url,
      message: tr("No OpenGraph tags — social shares will look unbranded.", "Pas de balises Open Graph : les partages sur les réseaux sociaux n’auront ni image ni titre choisis."),
    });
  }

  // Schema
  if (!hasJsonLd(html)) {
    findings.push({
      type: "missing_schema",
      severity: "medium",
      url,
      message:
        tr("No JSON-LD structured data — schema markup unlocks rich results in search.", "Pas de données structurées JSON-LD : elles rendent la page éligible aux résultats enrichis."),
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
      message: tr(`${missingAlt} of the first ${sample.length} images lack alt text.`, `${missingAlt} des ${sample.length} premières images n’ont pas de texte alternatif.`),
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
      message: tr(`${noLazy} images don't use loading="lazy" — slows initial render.`, `${noLazy} images n’utilisent pas loading="lazy" : l’affichage initial est ralenti.`),
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
      message: tr(`${oldFormat} images use legacy formats — convert to WebP/AVIF for ~30% smaller files.`, `${oldFormat} images sont dans un format ancien : passez-les en WebP ou AVIF pour des fichiers plus légers.`),
    });
  }

  // Content thinness
  const wordCount = countWords(html);
  if (wordCount < 200) {
    findings.push({
      type: "thin_content",
      severity: "medium",
      url,
      message: tr(`Page has only ${wordCount} words — Google may classify as thin content.`, `La page ne compte que ${wordCount} mots : Google peut la considérer comme un contenu trop mince.`),
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // 2026-critical per-page checks
  // ──────────────────────────────────────────────────────────────────────

  // CLS prevention: <img> without explicit width/height attributes
  const imgNoSize = sample.filter(
    (t) =>
      !/\swidth\s*=\s*["']?\d/i.test(t) ||
      !/\sheight\s*=\s*["']?\d/i.test(t),
  ).length;
  if (sample.length >= 3 && imgNoSize >= 3) {
    findings.push({
      type: "image_missing_dimensions",
      severity: "medium",
      url,
      message: tr(`${imgNoSize} images lack width/height attributes — causes layout shift (CLS) hurting Core Web Vitals.`, `${imgNoSize} images n’ont pas d’attributs width/height : la mise en page bouge au chargement (CLS), ce qui pénalise les Core Web Vitals.`),
    });
  }

  // Mixed content (HTTP resources on HTTPS page)
  if (page.finalUrl.startsWith("https://")) {
    const httpRefs =
      html.match(
        /(?:src|href)\s*=\s*["']http:\/\/(?!localhost|127\.0\.0\.1)[^"']+["']/gi,
      ) ?? [];
    if (httpRefs.length > 0) {
      findings.push({
        type: "mixed_content",
        severity: "high",
        url,
        message: tr(`${httpRefs.length} insecure HTTP resource${httpRefs.length === 1 ? "" : "s"} loaded on an HTTPS page — browsers block these.`, `${httpRefs.length} ressource${httpRefs.length === 1 ? "" : "s"} HTTP non sécurisée${httpRefs.length === 1 ? "" : "s"} chargée${httpRefs.length === 1 ? "" : "s"} sur une page HTTPS : les navigateurs les bloquent.`),
      });
    }
  }

  // Self-referencing canonical missing or wrong
  const canonicalHref = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  )?.[1];
  if (canonicalHref) {
    try {
      const canonAbs = new URL(canonicalHref, page.finalUrl).toString();
      // Allow trailing slash difference
      const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
      if (norm(canonAbs) !== norm(page.finalUrl)) {
        findings.push({
          type: "non_self_canonical",
          severity: "low",
          url,
          message: tr(`Canonical points elsewhere: ${canonAbs}. OK if intentional (duplicate content consolidation); fix if this should be the canonical itself.`, `La canonique pointe ailleurs : ${canonAbs}. Normal si c’est voulu (regroupement de contenus en double) ; à corriger si cette page doit être la canonique.`),
        });
      }
    } catch {
      findings.push({
        type: "invalid_canonical",
        severity: "medium",
        url,
        message: tr(`Canonical href is malformed: ${canonicalHref}`, `Adresse canonique mal formée : ${canonicalHref}`),
      });
    }
  }

  // X-Robots-Tag header noindex
  const xRobots = page.headers.get("x-robots-tag") ?? "";
  if (/\bnoindex\b/i.test(xRobots)) {
    findings.push({
      type: "xrobots_noindex",
      severity: "critical",
      url,
      message: tr(`X-Robots-Tag header has noindex: "${xRobots}". Page is excluded from search.`, `L’en-tête X-Robots-Tag contient noindex : « ${xRobots} ». La page est exclue des résultats.`),
    });
  }

  // Anchor text quality — flag "click here" / "read more" / "here" / "this"
  const anchorTexts: string[] = [];
  const anchorRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  let anchorMatch;
  while ((anchorMatch = anchorRe.exec(html)) && anchorTexts.length < 300) {
    const txt = anchorMatch[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (txt) anchorTexts.push(txt);
  }
  const weakAnchors = anchorTexts.filter((t) =>
    /^(click here|read more|here|this|learn more|more|link)$/i.test(t),
  ).length;
  if (anchorTexts.length >= 10 && weakAnchors >= 3) {
    findings.push({
      type: "weak_anchor_text",
      severity: "low",
      url,
      message: tr(`${weakAnchors} weak/non-descriptive anchor text${weakAnchors === 1 ? "" : "s"} ("click here", "read more"). Use descriptive anchor text — accessibility + SEO win.`, `${weakAnchors} texte${weakAnchors === 1 ? "" : "s"} de lien peu explicite${weakAnchors === 1 ? "" : "s"} (« cliquez ici », « en savoir plus »). Un texte de lien qui décrit sa cible aide l’accessibilité et le référencement.`),
    });
  }

  // JavaScript-only content gap — heuristic: very low rendered text but big <script> blocks
  // (Doesn't require a real headless re-render; flags pages that are likely SPA-rendered.)
  const scriptBytes = (html.match(/<script[\s\S]*?<\/script>/gi) ?? []).reduce(
    (s, t) => s + t.length,
    0,
  );
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const textLen = stripped.length;
  if (
    wordCount < 80 &&
    scriptBytes > 50_000 &&
    textLen < 500
  ) {
    findings.push({
      type: "js_rendered_only",
      severity: "high",
      url,
      message: tr(`Static HTML has very little content (${wordCount} words) but ${Math.round(scriptBytes / 1024)}KB of JS. Likely client-rendered — AI crawlers (GPTBot, ClaudeBot, PerplexityBot) don't run JS and will see a blank page.`, `Le HTML initial contient très peu de texte (${wordCount} mots) pour ${Math.round(scriptBytes / 1024)} Ko de JavaScript. La page est sans doute rendue dans le navigateur : les robots des IA (GPTBot, ClaudeBot, PerplexityBot) n’exécutent pas le JavaScript et verront une page vide.`),
    });
  }

  // Soft-404 patterns
  if (page.status === 200) {
    const titleAndBody = `${title ?? ""} ${stripped.slice(0, 600)}`.toLowerCase();
    if (
      /\b(page not found|not found|404|doesn'?t exist|no such page|sorry,? we couldn'?t find)\b/i.test(
        titleAndBody,
      )
    ) {
      findings.push({
        type: "soft_404",
        severity: "high",
        url,
        message:
          tr("Page returns 200 but content says 'not found' — soft-404. Return a real 404 status so Google de-indexes properly.", "La page répond 200 mais affiche « introuvable » (soft 404). Renvoyez un vrai code 404 pour que Google la retire de l’index."),
      });
    }
  }

  // Render-blocking resources approximation: <script> in <head> without async/defer
  const headMatch = html.match(/<head[^>]*>[\s\S]*?<\/head>/i);
  const headBlock = headMatch?.[0] ?? "";
  const blockingScripts = (
    headBlock.match(/<script\s[^>]*src=[^>]+>/gi) ?? []
  ).filter((s) => !/\b(async|defer|type=["']module["'])\b/i.test(s)).length;
  if (blockingScripts >= 3) {
    findings.push({
      type: "render_blocking_scripts",
      severity: "medium",
      url,
      message: tr(`${blockingScripts} blocking <script src> tags in <head> without async/defer — delays first paint.`, `${blockingScripts} balises <script src> bloquantes dans <head>, sans async ni defer : le premier affichage est retardé.`),
    });
  }

  // Page weight — flag very heavy HTML payloads
  if (html.length > 1_000_000) {
    findings.push({
      type: "heavy_html_payload",
      severity: "medium",
      url,
      message: tr(`HTML payload is ${Math.round(html.length / 1024)} KB — aim for under 500 KB. Inline a lot? Server-side render less or paginate.`, `Le HTML pèse ${Math.round(html.length / 1024)} Ko : visez moins de 500 Ko (moins de contenu intégré, ou une pagination).`),
    });
  }

  // Twitter card completeness (Open Graph already checked)
  const hasTwitterCard = /<meta[^>]+name=["']twitter:card["']/i.test(html);
  const hasTwitterTitle = /<meta[^>]+name=["']twitter:title["']/i.test(html);
  if (!hasTwitterCard || !hasTwitterTitle) {
    findings.push({
      type: "missing_twitter_card",
      severity: "low",
      url,
      message:
        tr("No <meta name='twitter:card'> — Twitter/X uses Open Graph as fallback but Twitter Cards give richer previews.", "Pas de <meta name='twitter:card'> : X (Twitter) se rabat sur Open Graph, mais les Twitter Cards donnent un meilleur aperçu."),
    });
  }

  // Article pages should have author Person schema.
  //
  // A page is an article when it says so: Article-type structured data or
  // og:type "article". The <article> element alone is not enough: sites use
  // it for any self-contained card (a service, a vehicle, a review), and it
  // flagged every service page of a local business as an article without
  // an author (nd-prestige.com: 25 of its findings, all wrong).
  const looksLikeArticle =
    /"@type"\s*:\s*"(?:Article|BlogPosting|NewsArticle)"/i.test(html) ||
    /<meta[^>]+property=["']og:type["'][^>]+content=["']article["']/i.test(html) ||
    /<meta[^>]+content=["']article["'][^>]+property=["']og:type["']/i.test(html);
  if (looksLikeArticle) {
    const hasAuthor =
      /"@type"\s*:\s*"Person"/i.test(html) ||
      /<meta[^>]+name=["']author["']/i.test(html) ||
      /<a[^>]+rel=["']author["']/i.test(html);
    if (!hasAuthor) {
      findings.push({
        type: "article_missing_author",
        severity: "medium",
        url,
        message:
          tr("Article-type page has no author byline or Person schema — Google's E-E-A-T uses author entity verification in 2026. Add author + Person JSON-LD.", "Article sans auteur indiqué ni schéma Person. Ajoutez l’auteur et son JSON-LD Person : Google s’appuie sur l’identité de l’auteur pour juger la fiabilité (E-E-A-T)."),
      });
    }
  }

  // Tap target / mobile usability — check viewport zoom restriction
  const viewportContent = html.match(
    /<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i,
  )?.[1];
  if (
    viewportContent &&
    /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?(?!\d)/i.test(
      viewportContent,
    )
  ) {
    findings.push({
      type: "viewport_blocks_zoom",
      severity: "medium",
      url,
      message:
        tr("Viewport disables zoom — accessibility violation and Google flags it on mobile usability.", "La balise viewport empêche le zoom : c’est un défaut d’accessibilité, signalé aussi par Google pour l’ergonomie mobile."),
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

/**
 * Same page, allowing for a trailing slash.
 *
 * runAudit takes the URL as typed and only prefixes a protocol, so
 * auditing "example.com" leaves homeUrl as "https://example.com" while
 * the crawled page's finalUrl is "https://example.com/". Comparing them
 * directly failed for every audit started without a trailing slash —
 * which is how everyone types a domain.
 *
 * The visible effect was that the home page did not match the "skip the
 * homepage" guard below, had no inbound internal links (nothing links to
 * the home page), and was reported as an ORPHAN PAGE on any site with
 * four or more pages. A site's own front page, listed as invisible.
 */
function sameUrl(a: string, b: string): boolean {
  const norm = (u: string) => {
    try {
      const url = new URL(u);
      url.hash = "";
      return (url.origin + url.pathname).replace(/\/+$/, "").toLowerCase();
    } catch {
      return u.replace(/\/+$/, "").toLowerCase();
    }
  };
  return norm(a) === norm(b);
}

async function checkSiteWide(
  homeUrl: string,
  pages: FetchedPage[],
  metaIndex: Map<string, { title: string | null; description: string | null }>,
  /**
   * See runAudit's allowPrivateHosts.
   *
   * This function fetched robots.txt and sitemap.xml without it while
   * the crawler threaded it everywhere else. On a private host the
   * guard rejected both, fetchText returned null, and the site was
   * reported as having NO robots.txt and NO sitemap — two confident
   * findings about files that were being served correctly the whole
   * time. Same shape as the broken-link checker, found the same way.
   */
  allowPrivate = false,
): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const root = new URL(homeUrl);
  const origin = root.origin;

  // robots.txt
  const robotsTxt = await fetchText(`${origin}/robots.txt`, 6_000, allowPrivate);
  let robotsExists = false;
  if (!robotsTxt || robotsTxt.status >= 400) {
    findings.push({
      type: "missing_robots_txt",
      severity: "medium",
      url: `${origin}/robots.txt`,
      message:
        tr("No /robots.txt found — search engines guess your crawl preferences.", "Aucun /robots.txt : les moteurs ne connaissent pas vos préférences d’exploration."),
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
        message: tr("robots.txt exists but looks malformed or empty.", "Le robots.txt existe mais semble vide ou mal formé."),
      });
    }

    // 2026 — explicit AI crawler policy. Most sites' robots.txt only
    // addresses Googlebot/Bingbot. GPTBot, ClaudeBot, PerplexityBot,
    // CCBot, Amazonbot, Applebot-Extended etc. need their own rules so
    // the owner can decide whether to allow AI training + AI search.
    const aiBots = [
      "GPTBot",
      "ClaudeBot",
      "PerplexityBot",
      "Google-Extended",
      "CCBot",
      "Amazonbot",
      "Applebot-Extended",
      "Bytespider",
      "anthropic-ai",
    ];
    const mentioned = aiBots.filter((b) =>
      new RegExp(`User-agent:\\s*${b}\\b`, "i").test(robotsTxt.text),
    );
    if (mentioned.length === 0) {
      findings.push({
        type: "missing_ai_crawler_policy",
        severity: "medium",
        url: `${origin}/robots.txt`,
        message:
          tr("robots.txt has no explicit policy for AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, etc.). Decide allow vs disallow — silence means default-allow for most, blocked for some.", "Le robots.txt ne dit rien des robots des IA (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot…). Décidez de les autoriser ou non : sans règle, la plupart se considèrent autorisés."),
      });
    } else if (mentioned.length < 4) {
      findings.push({
        type: "partial_ai_crawler_policy",
        severity: "low",
        url: `${origin}/robots.txt`,
        message: tr(`robots.txt addresses only ${mentioned.join(", ")} — consider also ${aiBots.filter((b) => !mentioned.includes(b)).slice(0, 4).join(", ")}.`, `Le robots.txt ne vise que ${mentioned.join(", ")} : envisagez aussi ${aiBots.filter((b) => !mentioned.includes(b)).slice(0, 4).join(", ")}.`),
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
    const r = await fetchText(sm, 6_000, allowPrivate);
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
        tr("No valid sitemap.xml found — sitemaps help Google discover pages faster.", "Aucun sitemap.xml valide : un sitemap aide Google à découvrir les pages plus vite."),
    });
  }

  // Security headers (check on homepage response)
  // Same trailing-slash problem: an exact match here fell through to
  // pages[0], which is the home page in practice and would not be if the
  // crawl order ever changed.
  const home = pages.find((p) => sameUrl(p.url, homeUrl)) ?? pages[0];
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
        message: tr(`Missing ${missing.length} security headers: ${missing.join(", ")}.`, `${missing.length} en-têtes de sécurité absents : ${missing.join(", ")}.`),
      });
    } else if (missing.length > 0) {
      findings.push({
        type: "missing_security_headers",
        severity: "low",
        url: homeUrl,
        message: tr(`Missing security headers: ${missing.join(", ")}.`, `En-têtes de sécurité absents : ${missing.join(", ")}.`),
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
        message: tr(`${urls.length} pages share the title "${title.slice(0, 60)}…" — each page should have a unique title.`, `${urls.length} pages ont le même title « ${title.slice(0, 60)}… » : chaque page devrait avoir le sien.`),
      });
    }
  }
  for (const [, urls] of descMap.entries()) {
    if (urls.length > 1) {
      findings.push({
        type: "duplicate_meta_description",
        severity: "medium",
        url: urls[0],
        message: tr(`${urls.length} pages share the same meta description.`, `${urls.length} pages ont la même méta-description.`),
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
      message: tr(`Hreflang tags exist on ${hreflangSeen} of ${pages.length} pages — usually all language variants should declare them.`, `Des balises hreflang sont présentes sur ${hreflangSeen} pages sur ${pages.length} : en général, toutes les versions linguistiques doivent les déclarer.`),
    });
  }

  // Hreflang reciprocity — every hreflang target must point back. Build a
  // map: page → list of declared alternates. Then check each declared
  // alternate has a return tag pointing to this page.
  const hreflangMap = new Map<string, { lang: string; href: string }[]>();
  for (const p of pages) {
    const alts: { lang: string; href: string }[] = [];
    const re =
      /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(p.html))) {
      try {
        alts.push({ lang: m[1], href: new URL(m[2], p.finalUrl).toString() });
      } catch {
        // ignore
      }
    }
    if (alts.length > 0) hreflangMap.set(p.finalUrl, alts);
  }
  let nonReciprocal = 0;
  for (const [src, alts] of hreflangMap) {
    for (const alt of alts) {
      const targetAlts = hreflangMap.get(alt.href);
      if (!targetAlts) continue;
      const points = targetAlts.some(
        (a) => a.href.replace(/\/+$/, "") === src.replace(/\/+$/, ""),
      );
      if (!points) nonReciprocal++;
    }
  }
  if (nonReciprocal > 0) {
    findings.push({
      type: "hreflang_not_reciprocal",
      severity: "medium",
      url: homeUrl,
      message: tr(`${nonReciprocal} hreflang link${nonReciprocal === 1 ? " is" : "s are"} not reciprocated — every language variant must declare ALL siblings. Google ignores non-reciprocal hreflang.`, `${nonReciprocal} lien${nonReciprocal === 1 ? "" : "s"} hreflang sans réciproque : chaque version linguistique doit déclarer toutes les autres. Google ignore les hreflang non réciproques.`),
    });
  }

  // Orphan pages: crawled pages that no other crawled page links to.
  //
  // This used to say it couldn't catch true orphans, and it couldn't —
  // the crawl only reached pages something linked to, so a page with no
  // inbound links was never fetched and could never be reported. The
  // crawl is now seeded from the sitemap, so a page that is published
  // and linked from nowhere shows up here, which is the case worth
  // reporting: it's in the sitemap, so the owner means it to be found.
  //
  // Still bounded by the crawl window — a page in neither the sitemap
  // nor any link is genuinely invisible and nothing can find it.
  const incomingLinks = new Map<string, number>();
  for (const p of pages) {
    const linkRe = /<a[^>]*\shref=["']([^"']+)["']/gi;
    let lm;
    while ((lm = linkRe.exec(p.html))) {
      try {
        const target = new URL(lm[1], p.finalUrl).toString().split("#")[0];
        incomingLinks.set(target, (incomingLinks.get(target) ?? 0) + 1);
      } catch {
        // ignore
      }
    }
  }
  const orphans: string[] = [];
  for (const p of pages) {
    // The home page needs no inbound links. Compared loosely because
    // homeUrl is the string the user typed and finalUrl is what the
    // server served — see sameUrl.
    if (sameUrl(p.finalUrl, homeUrl)) continue;
    const count = incomingLinks.get(p.finalUrl) ?? 0;
    if (count === 0) orphans.push(p.finalUrl);
  }
  if (orphans.length > 0 && pages.length >= 4) {
    findings.push({
      type: "orphan_pages",
      severity: "medium",
      url: homeUrl,
      message: tr(`${orphans.length} page${orphans.length === 1 ? " is" : "s are"} not linked from any other page in the crawl: ${orphans.slice(0, 3).join(", ")}${orphans.length > 3 ? "…" : ""}. Add internal links so Google can crawl them.`, `${orphans.length} page${orphans.length === 1 ? " n’est reliée" : "s ne sont reliées"} à aucune autre page explorée : ${orphans.slice(0, 3).join(", ")}${orphans.length > 3 ? "…" : ""}. Ajoutez des liens internes pour que Google les explore.`),
    });
  }

  // Canonical chain detection — if page A canonicalizes to B and B
  // canonicalizes to C, Google may ignore both signals. Walk the chain.
  const canonicalMap = new Map<string, string>();
  for (const p of pages) {
    const can = p.html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    )?.[1];
    if (!can) continue;
    try {
      const abs = new URL(can, p.finalUrl).toString();
      if (abs !== p.finalUrl) canonicalMap.set(p.finalUrl, abs);
    } catch {
      // ignore
    }
  }
  let chains = 0;
  for (const [src] of canonicalMap) {
    let cur = src;
    let depth = 0;
    while (canonicalMap.has(cur) && depth < 5) {
      cur = canonicalMap.get(cur)!;
      depth++;
    }
    if (depth >= 2) chains++;
  }
  if (chains > 0) {
    findings.push({
      type: "canonical_chain",
      severity: "medium",
      url: homeUrl,
      message: tr(`${chains} page${chains === 1 ? "" : "s"} canonicalize${chains === 1 ? "s" : ""} to URLs that themselves canonicalize elsewhere. Google may ignore both — fix to canonicalize directly to the final URL.`, `${chains} page${chains === 1 ? " a" : "s ont"} une canonique qui pointe vers une adresse elle-même canonisée ailleurs. Google peut ignorer les deux : faites pointer la canonique directement vers l’adresse finale.`),
    });
  }

  // Filter URLs left open to crawling, and content dated long ago: the
  // two checks that used to live only in their own tools
  // (lib/audit-site-checks.ts).
  const facets = findFacetTrap(pages);
  if (facets) {
    findings.push({
      type: "facet_trap",
      severity: facets.urlCount >= 50 ? "high" : "medium",
      url: facets.example,
      message: tr(`${facets.urlCount} filter URLs are linked and open to crawling (${facets.worstCount} on ${facets.worstPath}, parameters: ${facets.params.join(", ")}). Each one is a near-duplicate that spends crawl budget: point their canonical to the unfiltered page, or set them noindex.`, `${facets.urlCount} adresses de filtres sont liées et explorables (${facets.worstCount} sur ${facets.worstPath}, paramètres : ${facets.params.join(", ")}). Chacune est un quasi-doublon qui consomme le budget d’exploration : faites pointer leur canonique vers la page sans filtre, ou passez-les en noindex.`),
    });
  }
  const stale = findStaleContent(pages, new Date());
  if (stale) {
    findings.push({
      type: "stale_content",
      severity: "low",
      url: stale.oldestUrl,
      message: tr(`${stale.count} of ${stale.dated} dated page${stale.dated === 1 ? "" : "s"} ${stale.count === 1 ? "was" : "were"} last updated more than ${STALE_AFTER_MONTHS} months ago (the oldest in ${stale.oldestYear}). Search and AI answers prefer recent pages: review them and update their content and dateModified.`, `${stale.count} page${stale.count === 1 ? "" : "s"} datée${stale.count === 1 ? "" : "s"} sur ${stale.dated} n’${stale.count === 1 ? "a" : "ont"} pas été mise${stale.count === 1 ? "" : "s"} à jour depuis plus de ${STALE_AFTER_MONTHS} mois (la plus ancienne en ${stale.oldestYear}). Les moteurs et les réponses des IA préfèrent les pages récentes : relisez-les et mettez à jour leur contenu et leur dateModified.`),
    });
  }

  return findings;
}

export async function checkBrokenLinks(
  pages: FetchedPage[],
  origin: string,
  maxToCheck = 30,
  allowPrivate = false,
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
    let r = await fetchUrlStatus(u, 8_000, allowPrivate);
    // 429 (too many requests) and 503 say the site is slowing us down,
    // not that the page is gone: orlimmo.fr answered 429 to four links in
    // a row and the express audit called them broken in a sales pitch.
    // Wait once and ask again; if it still refuses, the link and every
    // one after it are left unchecked rather than reported broken.
    if (r && isThrottled(r.status)) {
      await sleep(THROTTLE_WAIT_MS);
      r = await fetchUrlStatus(u, 8_000, allowPrivate);
      if (r && isThrottled(r.status)) break;
    }
    if (r && r.status >= 400) {
      broken++;
      if (broken <= 5) {
        findings.push({
          type: "broken_link",
          severity: "high",
          url: onPage.get(u) ?? u,
          message: tr(`Link to ${u} returned HTTP ${r.status}.`, `Le lien vers ${u} a renvoyé HTTP ${r.status}.`),
        });
      }
    }
  }
  if (broken > 5) {
    findings.push({
      type: "broken_link",
      severity: "high",
      url: origin,
      message: tr(`${broken - 5} more broken internal links (showing first 5 above).`, `${broken - 5} autres liens internes cassés (les 5 premiers sont listés ci-dessus).`),
    });
  }

  return findings;
}

// ───────────────────────────────────────────────────────────────────────────
// Crawler
// ───────────────────────────────────────────────────────────────────────────

/**
 * How many pages to fetch at once.
 *
 * The crawler used to be strictly sequential — `await fetchPage()` in a
 * while loop — so a 25-page audit could take up to 25 x 12s = five
 * minutes on one thread, for the single most-used feature in the app.
 * Six is comfortably polite for a site audit (well under what a browser
 * opens) while cutting wall-clock roughly 5x. Sites that ask for a
 * Crawl-delay drop to one at a time; see `crawlSite`.
 */
const CRAWL_CONCURRENCY = 6;

/**
 * Upper bound on a site-requested Crawl-delay we'll actually honour.
 * Some robots.txt files carry `Crawl-delay: 3600` (or larger) aimed at
 * bulk scrapers; obeying that literally would hang the audit for an
 * hour with no feedback. We cap, and the audit reports the cap.
 */
const MAX_CRAWL_DELAY_MS = 5_000;

export type CrawlOutcome = {
  pages: FetchedPage[];
  /** URLs skipped because robots.txt disallowed them. */
  blockedByRobots: string[];
  /** Crawl-delay we actually applied, in ms. */
  appliedDelayMs: number;
  robotsUnreachable: boolean;
};

/**
 * URLs listed in the site's sitemap, to seed the crawl with.
 *
 * Best-effort by design: no sitemap, an unreachable one, or a malformed
 * one all fall back to plain link-following, which is what the crawl did
 * before. The only thing that changes is whether orphan pages are
 * reachable at all.
 *
 * Checks robots.txt for a `Sitemap:` line as well as the conventional
 * location, because WordPress with Yoast publishes /sitemap_index.xml
 * and declares it there.
 */
async function collectSitemapUrls(
  origin: string,
  allowPrivate = false,
): Promise<string[]> {
  const candidates = new Set<string>([`${origin}/sitemap.xml`]);

  const robots = await fetchText(`${origin}/robots.txt`, 6_000, allowPrivate);
  if (robots && robots.status < 400) {
    for (const line of robots.text.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) {
      candidates.add(line[1].trim());
    }
  }

  const found = new Set<string>();
  // A sitemap index points at more sitemaps. One level is enough for
  // the sites this tool is for, and stops a malformed or hostile
  // sitemap becoming an unbounded fetch loop.
  for (const sm of [...candidates].slice(0, 5)) {
    const r = await fetchText(sm, 10_000, allowPrivate);
    if (!r || r.status >= 400) continue;
    for (const m of r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      found.add(m[1]);
      if (found.size >= 500) return [...found];
    }
  }
  return [...found];
}

async function crawlSite(
  homeUrl: string,
  options: {
    maxPages: number;
    maxDepth: number;
    /**
     * Ignore robots.txt. For staging/pre-production audits of a site the
     * user controls — the case CLAUDE.md calls out. Off by default:
     * this tool crawls competitor and prospect sites, so obeying
     * robots.txt has to be the default, not an option nobody finds.
     */
    ignoreRobots?: boolean;
    /**
     * URLs to crawl in addition to whatever is reachable by following
     * links, normally everything in the sitemap.
     *
     * Without these, a crawl is blind to exactly the pages worth
     * finding. An orphan page has no inbound links, so a link-following
     * crawl never reaches it, so it never appears in `pages`, so the
     * `orphan_pages` check could only ever report pages that were
     * linked from somewhere — which is to say, not orphans. Measured on
     * a four-page fixture with one real orphan: three pages crawled,
     * zero orphans reported.
     */
    seedUrls?: string[];
    /** See runAudit`s allowPrivateHosts. */
    allowPrivate?: boolean;
    /**
     * Called after each page is fetched, so callers can show how far a
     * crawl has got. A long crawl with no feedback reads as a hang.
     */
    onProgress?: (crawled: number, max: number) => void;
  },
): Promise<CrawlOutcome> {
  const visited = new Set<string>();
  const results: FetchedPage[] = [];
  const blockedByRobots: string[] = [];
  const origin = new URL(homeUrl).origin;

  const policy = options.ignoreRobots
    ? ALLOW_ALL
    : await fetchRobotsPolicy(
        origin,
        USER_AGENT,
        6_000,
        options.allowPrivate === true,
      );

  const delayMs = Math.min(
    (policy.crawlDelaySec ?? 0) * 1000,
    MAX_CRAWL_DELAY_MS,
  );
  // A site that asks us to slow down gets one request at a time —
  // running six in parallel and then sleeping would defeat the point.
  const concurrency = delayMs > 0 ? 1 : CRAWL_CONCURRENCY;

  function crawlable(u: URL): boolean {
    if (options.ignoreRobots) return true;
    return isAllowed(policy, u.pathname + u.search);
  }

  if (!crawlable(new URL(homeUrl))) {
    return {
      pages: [],
      blockedByRobots: [homeUrl],
      appliedDelayMs: delayMs,
      robotsUnreachable: policy.unreachable,
    };
  }

  // BFS frontier, drained a level at a time so `maxDepth` still means
  // depth. Within a level, pages are fetched `concurrency` at a time.
  let frontier: string[] = [homeUrl];
  visited.add(homeUrl);

  // Sitemap URLs join the first level. Same-origin only — a sitemap is
  // data from the site being audited, and a wrong or hostile one must
  // not be able to send the crawler somewhere else — and still subject
  // to robots.txt and maxPages like anything else.
  for (const seed of options.seedUrls ?? []) {
    if (results.length >= options.maxPages) break;
    let u: URL;
    try {
      u = new URL(seed, homeUrl);
    } catch {
      continue;
    }
    if (u.origin !== origin) continue;
    const normalised = u.toString().split("#")[0];
    if (visited.has(normalised)) continue;
    if (!crawlable(u)) continue;
    visited.add(normalised);
    frontier.push(normalised);
  }

  for (let depth = 0; depth <= options.maxDepth; depth++) {
    if (frontier.length === 0) break;
    if (results.length >= options.maxPages) break;

    const level = frontier.slice(0, options.maxPages - results.length);
    frontier = [];

    let cursor = 0;
    const nextLinks: string[] = [];

    async function worker(): Promise<void> {
      while (true) {
        const i = cursor++;
        if (i >= level.length) return;
        if (results.length >= options.maxPages) return;

        if (delayMs > 0 && i > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }

        const page = await fetchPage(level[i], 12_000, options.allowPrivate === true);
        if (!page) continue;
        if (!page.headers.get("content-type")?.includes("html")) continue;
        results.push(page);
        // Report after each page so a caller can show real progress
        // rather than an indeterminate spinner. Never let a reporting
        // failure take the crawl down with it.
        try {
          options.onProgress?.(results.length, options.maxPages);
        } catch {
          // A broken progress callback is not a reason to lose an audit.
        }
        if (depth < options.maxDepth) {
          nextLinks.push(...extractHrefs(page.html, page.finalUrl));
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, level.length) }, worker),
    );

    for (const href of nextLinks) {
      try {
        const u = new URL(href);
        if (u.origin !== origin) continue;
        if (
          /\.(pdf|jpg|jpeg|png|gif|svg|webp|avif|mp4|zip|css|js)(\?|$)/i.test(
            u.pathname,
          )
        )
          continue;
        // Cap check FIRST. Previously this ran AFTER `visited.add`,
        // so a site with pathological redirects could grow visited
        // into 10k+ entries (~50 MB) before the check fired.
        if (visited.size >= options.maxPages * 4) break;
        const key = u.toString();
        if (visited.has(key)) continue;
        visited.add(key);
        if (!crawlable(u)) {
          if (blockedByRobots.length < 25) blockedByRobots.push(key);
          continue;
        }
        frontier.push(key);
      } catch {
        // ignore malformed
      }
    }
  }

  return {
    pages: results,
    blockedByRobots,
    appliedDelayMs: delayMs,
    robotsUnreachable: policy.unreachable,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Scoring
// ───────────────────────────────────────────────────────────────────────────

/**
 * Health score, 0-100.
 *
 * The two classes of finding have to be weighted differently:
 *
 *   - **Per-page** findings (missing title, no canonical, thin content…)
 *     repeat once per crawled page. Their total scales LINEARLY with
 *     crawl size, so they're averaged: the score answers "how bad is a
 *     typical page here?"
 *   - **Site-wide** findings (no robots.txt, no sitemap, broken links)
 *     occur once per site regardless of crawl size, so they're applied
 *     at full weight.
 *
 * The previous implementation divided the COMBINED total by
 * `sqrt(pageCount)`. Because per-page findings grow as O(n) and the
 * divisor only as O(√n), the same site scored progressively worse the
 * more pages you crawled — 25 pages of identical issues took a 5×
 * bigger hit than 1 page. That made scores incomparable between runs
 * (crawl size varies with timeouts and settings) and turned the
 * dashboard's health-score trend line into a measure of crawl depth
 * rather than SEO health.
 *
 * Exported so the regression test can assert the property that matters:
 * crawling more pages of the same quality must not change the score.
 */
export function scoreFindings(
  findings: AuditFinding[],
  perPageCount: number,
  pagesCrawled: number,
): number {
  const pages = Math.max(1, pagesCrawled);

  let perPageWeight = 0;
  for (let i = 0; i < perPageCount && i < findings.length; i++) {
    perPageWeight += severityWeight[findings[i].severity];
  }

  let siteWideWeight = 0;
  for (let i = perPageCount; i < findings.length; i++) {
    siteWideWeight += severityWeight[findings[i].severity];
  }

  const penalty = perPageWeight / pages + siteWideWeight;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

/**
 * Re-fetch a page through a real browser when its static HTML looks
 * client-rendered, and use the rendered DOM for the checks instead.
 *
 * Without this, every React/Vue/Angular SPA produced a wall of false
 * criticals — missing_title, missing_h1, thin_content, missing_meta —
 * because the checks run regex over whatever `fetch` returned, which
 * for an SPA is an empty shell. We already *detected* the situation
 * (the `js_rendered_only` finding) and then reported the symptoms as if
 * they were real problems.
 *
 * The `js_rendered_only` finding itself is still emitted from the
 * static HTML, because it remains true and useful: AI crawlers don't
 * run JS either, so a page that only exists after hydration really is
 * invisible to them. What changes is that we no longer *also* claim the
 * page has no title.
 *
 * Best-effort: if the browser pool is unavailable or lean mode is on,
 * we keep the static HTML and the checks behave exactly as before.
 */
async function renderIfClientSide(
  page: FetchedPage,
): Promise<FetchedPage> {
  const wordCount = countWords(page.html);
  const scriptBytes = (page.html.match(/<script[\s\S]*?<\/script>/gi) ?? []).reduce(
    (s, t) => s + t.length,
    0,
  );
  // Same thresholds as the js_rendered_only finding, so the two can't
  // disagree about whether a page is client-rendered.
  const looksClientRendered = wordCount < 80 && scriptBytes > 50_000;
  if (!looksClientRendered) return page;

  try {
    const { withBrowserPage } = await import("./browser-pool");
    const html = await withBrowserPage(
      async (p) => {
        await p.goto(page.finalUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        // networkidle is unreliable on pages with polling/analytics;
        // a short settle after DOMContentLoaded catches the hydration
        // pass without waiting on long-lived connections.
        await p.waitForTimeout(1_200);
        return p.content();
      },
      { blockHeavyResources: true },
    );
    if (html && countWords(html) > wordCount) {
      return { ...page, html, renderedWithJs: true };
    }
  } catch {
    // Browser unavailable / lean mode / navigation failed — fall back
    // to static HTML rather than failing the audit.
  }
  return page;
}

export async function runAudit(
  rawUrl: string,
  options: {
    maxPages?: number;
    maxDepth?: number;
    /** Skip robots.txt. For staging sites the user controls. */
    ignoreRobots?: boolean;
    /**
     * Re-render client-side pages in a real browser before checking
     * them. On by default — without it SPAs get a wall of false
     * "missing title / no h1 / thin content" criticals.
     */
    renderJs?: boolean;
    /**
     * Allow auditing a site on a private address — localhost, a LAN
     * range, a docker-compose hostname.
     *
     * Off by default and never set by the public grader, which anyone
     * on the internet can reach. Only an operator auditing their own
     * infrastructure should turn this on.
     */
    allowPrivateHosts?: boolean;
    /**
     * Progress callback, fired once per crawled page. Used by the client
     * onboarding flow to show a real progress bar instead of leaving a
     * multi-minute crawl looking like nothing is happening.
     */
    onProgress?: (crawled: number, max: number) => void;
    /** Language of the messages; the workspace language by default. */
    locale?: string;
  } = {},
): Promise<AuditResult> {
  setAuditLanguage(options.locale ?? (await getReportLocale()));
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const fetchedAt = new Date();
  const maxPages = options.maxPages ?? 25;
  const maxDepth = options.maxDepth ?? 2;
  const renderJs = options.renderJs !== false;

  // Check the entry URL up front and say plainly why it was refused.
  // Left to the crawler, a blocked address falls through as "No pages
  // reachable. Check the URL or your network." — which sends someone
  // auditing http://localhost:3000 off debugging their network instead
  // of telling them the server won't fetch its own address.
  const entryVerdict = await guardUrl(url, {
    allowPrivate: options.allowPrivateHosts === true,
  });
  if (!entryVerdict.ok) {
    return {
      url,
      finalUrl: url,
      status: 0,
      fetchedAt,
      pagesCrawled: 0,
      findings: [
        {
          type: "blocked_url",
          severity: "critical",
          url,
          message: tr(`${entryVerdict.reason} Audits run on the server, so it can only reach addresses that are reachable from the public internet.`, `${entryVerdict.reason} L’audit tourne sur le serveur : il ne peut joindre que des adresses accessibles depuis Internet.`),
        },
      ],
      score: 0,
    };
  }

  // Crawl
  let pages: FetchedPage[];
  let crawl: CrawlOutcome;
  try {
    // Read the sitemap first so orphan pages are reachable. The audit
    // already fetched it later on for the missing_sitemap finding, but
    // by then the crawl was over and anything nothing links to had
    // already been missed.
    const seedUrls = await collectSitemapUrls(
      new URL(url).origin,
      options.allowPrivateHosts === true,
    );

    crawl = await crawlSite(url, {
      maxPages,
      maxDepth,
      ignoreRobots: options.ignoreRobots,
      seedUrls,
      allowPrivate: options.allowPrivateHosts === true,
      onProgress: options.onProgress,
    });
    pages = crawl.pages;
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
          message: tr(`Could not crawl: ${(err as Error).message}`, `Exploration impossible : ${(err as Error).message}`),
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
          message: tr("No pages reachable. Check the URL or your network.", "Aucune page joignable. Vérifiez l’adresse ou le réseau."),
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

  // Tech-stack-aware: detect once on the homepage HTML so per-page checks
  // can route to platform-specific rules without re-detecting.
  const tech = await (async () => {
    try {
      const { detectTechStack } = await import("./tech-detect");
      const r = await detectTechStack(url, options.allowPrivateHosts === true);
      return r.technologies.map((t) => t.name);
    } catch {
      return [] as string[];
    }
  })();
  const { classifyTech, runTechSpecificChecks } = await import(
    "./tech-audit-rules"
  );
  const techContext = classifyTech(tech);

  // Re-render client-side pages before checking them, so an SPA is
  // graded on what a browser sees rather than on its empty shell.
  // Concurrency-capped by the shared browser pool.
  const checkable = renderJs
    ? await Promise.all(pages.map((p) => renderIfClientSide(p)))
    : pages;

  for (const page of checkable) {
    const r = checkPage(page);
    findings.push(...r.findings);
    metaIndex.set(page.finalUrl, r.meta);
    // Per-tech checks
    const techFindings = runTechSpecificChecks({
      url: page.finalUrl,
      html: page.html,
      headers: page.headers,
      tech: techContext,
      fr: FR,
    });
    for (const tf of techFindings) {
      findings.push({
        type: tf.type,
        severity: tf.severity,
        url: tf.url,
        message: `[${tf.tech}] ${tf.message}`,
      });
    }
  }

  // Everything above this line is PER-PAGE — it repeats once for every
  // crawled page. Snapshot the count before site-wide checks append to
  // the same array, so scoring can weight the two classes correctly.
  const perPageFindings = findings.length;
  const origin = new URL(url).origin;

  // Tell the user what we skipped and why. Silently crawling fewer
  // pages than asked looks like the crawler failed; naming robots.txt
  // as the cause turns it into information they can act on (and, on
  // their own staging site, override).
  if (crawl.blockedByRobots.length > 0) {
    findings.push({
      type: "blocked_by_robots",
      severity: "low",
      url: crawl.blockedByRobots[0],
      message: tr(`${crawl.blockedByRobots.length} page${crawl.blockedByRobots.length === 1 ? " was" : "s were"} skipped because robots.txt disallows crawling them (e.g. ${crawl.blockedByRobots[0]}). Googlebot is subject to the same rules — if these pages should rank, loosen the Disallow.`, `${crawl.blockedByRobots.length} page${crawl.blockedByRobots.length === 1 ? " a été ignorée" : "s ont été ignorées"} car le robots.txt en interdit l’exploration (par exemple ${crawl.blockedByRobots[0]}). Googlebot suit les mêmes règles : si ces pages doivent se positionner, assouplissez le Disallow.`),
    });
  }
  if (crawl.appliedDelayMs > 0) {
    findings.push({
      type: "crawl_delay_applied",
      severity: "low",
      url: origin,
      message: tr(`robots.txt requests a crawl delay, so this audit fetched pages one at a time (${crawl.appliedDelayMs}ms apart). That slows every crawler, including search engines.`, `Le robots.txt demande un délai d’exploration : l’audit a lu les pages une par une (${crawl.appliedDelayMs} ms d’écart). Cela ralentit tous les robots, moteurs de recherche compris.`),
    });
  }

  // Site-wide checks
  const siteFindings = await checkSiteWide(
    url,
    pages,
    metaIndex,
    options.allowPrivateHosts === true,
  );
  findings.push(...siteFindings);

  // Broken links (best effort, capped)
  const linkFindings = await checkBrokenLinks(
    pages,
    origin,
    30,
    options.allowPrivateHosts === true,
  );
  findings.push(...linkFindings);

  const score = scoreFindings(findings, perPageFindings, pages.length);

  const home = pages[0];
  return {
    url,
    finalUrl: home.finalUrl,
    status: home.status,
    fetchedAt,
    pagesCrawled: pages.length,
    crawledUrls: [...new Set(pages.flatMap((p) => [p.url, p.finalUrl]))],
    findings,
    score,
  };
}
