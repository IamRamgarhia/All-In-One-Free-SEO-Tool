/**
 * The deep rule engine (src/audit: 373 rules in 20 weighted categories),
 * run as part of SEO Tool's one site audit.
 *
 * The site crawl in ./audit.ts still runs SEO Tool's own checks: their
 * finding types are what the agent, quick wins and the fix guides key off.
 * The engine reads the same site after it and supplies the score (weighted
 * by category, with caps for noindex, robots.txt blocking, empty or thin
 * pages and a missing title), the per-rule history behind diffs, and a
 * finding for every rule that fails or warns, except where one of SEO
 * Tool's checks already reported the same problem on that page.
 *
 * Modes: `quick` reads the start page and up to a few linked pages from
 * their HTML alone, no browser. `full` crawls further, renders each page in
 * the shared browser pool and measures Core Web Vitals (INP through a
 * synthetic interaction) and mobile parity.
 */

import { Auditor, withNetPolicy } from "@/audit";
import type { AuditorOptions, AuditResult as EngineResult } from "@/audit/types";
import type { AuditFinding } from "./audit";

export type AuditMode = "quick" | "full";

export const AUDIT_MODES: readonly AuditMode[] = ["quick", "full"];

export function isAuditMode(value: unknown): value is AuditMode {
  return value === "quick" || value === "full";
}

/** Pages the engine crawls in each mode. */
export const ENGINE_MAX_PAGES: Record<AuditMode, number> = { quick: 8, full: 20 };

/**
 * Engine rules that measure the same thing as one of SEO Tool's own
 * checks. When the check already reported it on a page, the engine's copy
 * is dropped there: the check's finding type is the one tasks, the agent
 * and the fix guides know, and a problem listed twice reads as two.
 *
 * Keys are engine rule ids (the registry is their only list); values are
 * types from AUDIT_FINDING_TYPES. A drift test checks both sides.
 */
export const ENGINE_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = {
  "core-title-present": ["missing_title"],
  "core-title-length": ["short_title", "long_title"],
  "core-title-unique": ["duplicate_title"],
  "core-description-present": ["missing_meta_description"],
  "core-description-length": ["short_meta_description", "long_meta_description"],
  "content-duplicate-description": ["duplicate_meta_description"],
  "core-canonical-present": ["missing_canonical"],
  "core-canonical-valid": ["invalid_canonical"],
  // Both say "the canonical points to another URL, fine if intentional".
  // Not core-canonical-to-homepage: that one is a real error, and more
  // precise than the crawler's generic note, so it stays.
  "core-canonical-external": ["non_self_canonical"],
  "crawl-canonical-chain": ["canonical_chain"],
  "core-h1-present": ["missing_h1"],
  "content-heading-hierarchy": ["heading_order"],
  "a11y-heading-order": ["heading_order"],
  "core-favicon-present": ["missing_favicon"],
  "core-viewport-present": ["missing_viewport"],
  "a11y-zoom-disabled": ["viewport_blocks_zoom"],
  "core-robots-meta": ["noindex_set", "xrobots_noindex"],
  "i18n-lang-attribute": ["missing_lang"],
  "i18n-hreflang-return-links": ["hreflang_not_reciprocal"],
  "crawl-hreflang-reciprocity": ["hreflang_not_reciprocal"],
  "images-alt-present": ["missing_image_alt"],
  "images-dimensions": ["image_missing_dimensions"],
  "images-lazy-loading": ["no_lazy_loading"],
  "images-modern-format": ["old_image_formats"],
  "social-og-title": ["missing_og_tags"],
  "social-og-description": ["missing_og_tags"],
  "social-og-image": ["missing_og_tags"],
  "social-twitter-card": ["missing_twitter_card"],
  "schema-present": ["missing_schema"],
  "eeat-author-byline": ["article_missing_author"],
  "security-https": ["no_https"],
  "security-mixed-content": ["mixed_content"],
  "security-hsts": ["missing_security_headers"],
  "security-x-frame-options": ["missing_security_headers"],
  "security-x-content-type-options": ["missing_security_headers"],
  "security-referrer-policy": ["missing_security_headers"],
  "technical-robots-txt-exists": ["missing_robots_txt"],
  "technical-robots-txt-valid": ["invalid_robots_txt"],
  "technical-sitemap-exists": ["missing_sitemap"],
  "technical-soft-404": ["soft_404"],
  "technical-timeout": ["slow_response"],
  "perf-response-time": ["slow_response"],
  "perf-render-blocking": ["render_blocking_scripts"],
  "htmlval-size-limit": ["heavy_html_payload"],
  "js-ssr-check": ["js_rendered_only"],
  "content-word-count": ["thin_content"],
  "links-broken-internal": ["broken_link"],
  "links-orphan-pages": ["orphan_pages"],
  "links-anchor-text": ["weak_anchor_text"],
};

function pageKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return `${u.origin}${u.pathname.replace(/\/+$/, "") || "/"}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * Engine findings minus the ones an SEO Tool check already reported on the
 * same page (or site-wide, on the origin). Engine finding types are
 * `seomator:<rule id>`.
 */
export function dropCovered<T extends AuditFinding>(engine: readonly T[], existing: readonly AuditFinding[]): T[] {
  const reported = new Set(existing.map((f) => `${f.type}::${pageKey(f.url)}`));
  return engine.filter((f) => {
    const ruleId = f.type.startsWith("seomator:") ? f.type.slice("seomator:".length) : f.type;
    const equivalents = ENGINE_EQUIVALENTS[ruleId];
    if (!equivalents) return true;
    let origin = f.url;
    try {
      origin = new URL(f.url).origin;
    } catch {
      // keep the raw value
    }
    return !equivalents.some(
      (type) => reported.has(`${type}::${pageKey(f.url)}`) || reported.has(`${type}::${pageKey(origin)}`),
    );
  });
}

// The engine keeps cross-page state between rules for the length of one
// run (title uniqueness, sitemap caches), reset at the start of each. Two
// runs interleaved in one process would read each other's pages, so runs
// queue here, one at a time.
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export type EngineOptions = Pick<
  AuditorOptions,
  | "browserFetcher"
  | "onCategoryStart"
  | "onCategoryComplete"
  | "onRuleComplete"
  | "onCrawlProgress"
  | "signal"
> & {
  mode: AuditMode;
  maxPages?: number;
  /** Operator setting: let the engine fetch private or LAN addresses */
  allowPrivateHosts?: boolean;
  ignoreRobots?: boolean;
};

export async function runEngine(url: string, options: EngineOptions): Promise<EngineResult> {
  const { mode, maxPages = ENGINE_MAX_PAGES[mode], allowPrivateHosts, ignoreRobots, ...hooks } = options;
  const full = mode === "full";
  return serialized(() =>
    withNetPolicy({ allowPrivate: allowPrivateHosts === true }, async () => {
      const auditor = new Auditor({
        timeout: 15_000,
        measureCwv: full,
        simulateInteraction: full,
        mobileParity: full,
        respectRobots: ignoreRobots !== true,
        // The same politeness the site crawler uses.
        perHostDelayMs: full ? 200 : 0,
        ...hooks,
      });
      return maxPages > 1 ? auditor.auditWithCrawl(url, maxPages, full ? 2 : 3) : auditor.audit(url);
    }),
  );
}
