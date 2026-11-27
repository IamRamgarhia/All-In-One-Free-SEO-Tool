/**
 * What each audit-engine rule is, for the person reading the audit.
 *
 * The engine (SEOmator, 398 rules in 8.0.1) is a wide site audit, not an
 * SEO audit: it also checks accessibility, security headers, share
 * buttons and files for AI agents. Shown as one list, a client reads
 * "38 SEO problems" when ten of them are about Google. So every rule sits
 * in one of four tiers, and the audit page, the score, the client report
 * and the task list all read them from here:
 *
 *   seo   what Google uses to crawl, index or rank the site — scored,
 *         reported to the client, turned into tasks;
 *   comp  complementary: helps search indirectly, or for some sites only
 *         (fine performance, URL shape, trust signals, AI visibility) —
 *         scored, second-rank tasks;
 *   info  good practice with no effect on Google (accessibility, social
 *         previews, files for AI agents, analytics tags) — shown as
 *         advice, outside the score, the report and the tasks;
 *   hors  off-topic for SEO: a security or legal audit (security
 *         headers, cookies, consent) — shown apart, outside everything.
 *
 * A rule not listed below is `seo`. The lists are by the rule's own
 * category; the reasoning for the borderline ones is next to them.
 *
 * Rules written for one kind of site (lib/advisory-rules.ts: editorial,
 * local, shop) are `comp` on that kind of site and `info` elsewhere.
 */

import { EDITORIAL_RULES, LOCAL_RULES, SHOP_RULES, isAdvisoryFor, type SiteKind } from "./advisory-rules";
import { COMPLEMENTARY_RULES, INFORMATIVE_RULES, OFF_TOPIC_RULES } from "./rule-tier-lists";

export { COMPLEMENTARY_RULES, INFORMATIVE_RULES, OFF_TOPIC_RULES };

export type RuleTier = "seo" | "comp" | "info" | "hors";

/** Display order: what matters for Google first. */
export const RULE_TIERS: readonly RuleTier[] = ["seo", "comp", "info", "hors"];

const KIND_RULES: ReadonlySet<string> = new Set([...EDITORIAL_RULES, ...LOCAL_RULES, ...SHOP_RULES]);

/** The tier of an engine rule, for this kind of site. */
export function ruleTier(ruleId: string, kind?: SiteKind | null): RuleTier {
  const id = ruleId.replace(/^seomator:/, "");
  if (OFF_TOPIC_RULES.has(id)) return "hors";
  if (INFORMATIVE_RULES.has(id)) return "info";
  if (KIND_RULES.has(id)) return isAdvisoryFor(id, kind) ? "info" : "comp";
  if (COMPLEMENTARY_RULES.has(id)) return "comp";
  return "seo";
}

/** Counted in the score, reported and turned into tasks. */
export function isScoredTier(tier: RuleTier): boolean {
  return tier === "seo" || tier === "comp";
}
