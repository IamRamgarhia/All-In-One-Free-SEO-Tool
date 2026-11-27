/**
 * Engine rules that are good practice, not search ranking.
 *
 * The audit engine (373 rules, ported from SEOmator 7.0.0) is a wide site
 * audit: a quarter of its score came from security headers, accessibility,
 * share buttons and files for AI agents. Measured on nd-prestige.com, these
 * made 30% of the findings, none of them something Google ranks on, and the
 * client report listed them as SEO problems.
 *
 * These rules still run and still show on the audit page, rule by rule, as
 * good practice. They are kept out of the SEO score, out of the findings a
 * client sees, and out of the task list. SEOmator itself does the same from
 * 8.0 ("advisory" rules, outside the score).
 *
 * Kept in the score on purpose: HTTPS, the HTTPS redirect, mixed content and
 * an expiring certificate (Google uses HTTPS and browsers block the rest),
 * signs of a hacked site (impersonation, obfuscated scripts: Google flags
 * those sites), descriptive link text (Lighthouse's SEO audit checks it),
 * AI crawler access and content structure (visibility in AI answers is part
 * of what the tool sells).
 *
 * The list itself is the "informative" and "off-topic" tiers of
 * lib/rule-tiers.ts (kept in lib/rule-tier-lists.ts): one list, so the
 * score, the report and the audit page cannot disagree.
 */

import { INFORMATIVE_RULES, OFF_TOPIC_RULES } from "./rule-tier-lists";

export const ADVISORY_RULES: ReadonlySet<string> = new Set([...INFORMATIVE_RULES, ...OFF_TOPIC_RULES]);

export function isAdvisoryRule(ruleId: string): boolean {
  return ADVISORY_RULES.has(ruleId);
}

/**
 * Rules that only count for some kinds of site, from the client's niche.
 *
 * The engine applies every rule to every site: a chauffeur's service pages
 * were faulted for having no author, no publication date, no editorial
 * policy and no citations, like a magazine, and a SaaS would be faulted for
 * having no street address. Outside the kinds they are written for these
 * rules become good practice like the ones above: still shown, not scored.
 *
 * A client without a niche keeps every rule scored, as before.
 */
export type SiteKind = "local" | "ecommerce" | "saas" | "blog" | "services";

/** Editorial signals: they matter on a site that publishes content. */
export const EDITORIAL_RULES: ReadonlySet<string> = new Set([
  "eeat-author-byline",
  "eeat-author-expertise",
  "eeat-content-dates",
  "eeat-editorial-policy",
  "eeat-citations",
  "content-article-links",
  "schema-article",
]);
const EDITORIAL_KINDS: ReadonlySet<SiteKind> = new Set(["blog"]);

/** Local presence: they matter for a business that serves a place. */
export const LOCAL_RULES: ReadonlySet<string> = new Set([
  "eeat-nap-consistency",
  "eeat-physical-address",
  "eeat-geo-meta",
  "schema-local-business",
]);
const LOCAL_KINDS: ReadonlySet<SiteKind> = new Set(["local", "services"]);

/** Product pages: they matter on a shop. */
export const SHOP_RULES: ReadonlySet<string> = new Set(["schema-product"]);
const SHOP_KINDS: ReadonlySet<SiteKind> = new Set(["ecommerce"]);

/**
 * The GEO engine's editorial findings (lib/geo-audit), same reasoning as
 * EDITORIAL_RULES: who wrote it, when it was checked, article markup.
 */
export const EDITORIAL_GEO_FINDINGS: ReadonlySet<string> = new Set([
  "geo:content.expertise",
  "geo:content.freshness",
  "geo:citability.attribution",
  "geo:schema.article",
]);

export function isSiteKind(value: unknown): value is SiteKind {
  return value === "local" || value === "ecommerce" || value === "saas" || value === "blog" || value === "services";
}

/** Good practice for this site: always-advisory rules, plus the ones written for other kinds of site. */
export function isAdvisoryFor(ruleId: string, kind: SiteKind | null | undefined): boolean {
  if (ADVISORY_RULES.has(ruleId)) return true;
  if (!kind) return false;
  if (EDITORIAL_RULES.has(ruleId) && !EDITORIAL_KINDS.has(kind)) return true;
  if (LOCAL_RULES.has(ruleId) && !LOCAL_KINDS.has(kind)) return true;
  if (SHOP_RULES.has(ruleId) && !SHOP_KINDS.has(kind)) return true;
  return false;
}

/** A GEO-engine finding type that is not a problem for this kind of site. */
export function isAdvisoryGeoFinding(type: string, kind: SiteKind | null | undefined): boolean {
  return Boolean(kind) && !EDITORIAL_KINDS.has(kind as SiteKind) && EDITORIAL_GEO_FINDINGS.has(type);
}
