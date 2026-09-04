/**
 * The finding types the crawler can emit — one list, in one place.
 *
 * This exists because there were four lists and every one of them had
 * drifted. `src/lib/audit.ts` invents its type strings inline, and three
 * separate consumers restated them from memory:
 *
 *   - the agent's FIXABLE map said `title_too_long`, `title_too_short`,
 *     `meta_description_too_long` and `missing_alt_text`. The crawler
 *     emits `long_title`, `short_title`, `long_meta_description` and
 *     `missing_image_alt`. So four of the agent's seven fixable findings
 *     could never be planned from a real audit — including alt text,
 *     which had a whole capability, an executor branch and an
 *     end-to-end test built for it.
 *   - the quick-wins finder had nine names out of sixteen that nothing
 *     ever produces, so those quick wins never appeared.
 *   - the issue explainers had thirteen entries out of twenty-two keyed
 *     to names the crawler doesn't use, so that guidance was written and
 *     never once shown to a user.
 *
 * None of it errored. Each list looked reasonable on its own, and the
 * only symptom was work quietly not happening.
 *
 * CLAUDE.md's fourth standing rule is "never add a second hardcoded list
 * of something that already exists". This is the first list; everything
 * else keys into it, and `audit-finding-types.test.ts` fails the build
 * if any consumer or the crawler itself drifts away from it.
 *
 * Adding a check to the crawler? Add the type here in the same commit.
 * The test will tell you if you forget.
 */

export const AUDIT_FINDING_TYPES = [
  "article_missing_author",
  "bad_status",
  "blocked_by_robots",
  "blocked_url",
  "broken_link",
  "canonical_chain",
  "crawl_delay_applied",
  "duplicate_meta_description",
  "duplicate_title",
  "fetch_failed",
  "heading_order",
  "heavy_html_payload",
  "hreflang_not_reciprocal",
  "image_missing_dimensions",
  "inconsistent_hreflang",
  "invalid_canonical",
  "invalid_robots_txt",
  "js_rendered_only",
  "long_meta_description",
  "long_title",
  "missing_ai_crawler_policy",
  "missing_canonical",
  "missing_favicon",
  "missing_h1",
  "missing_image_alt",
  "missing_lang",
  "missing_meta_description",
  "missing_og_tags",
  "missing_robots_txt",
  "missing_schema",
  "missing_security_headers",
  "missing_sitemap",
  "missing_title",
  "missing_twitter_card",
  "missing_viewport",
  "mixed_content",
  "no_https",
  "no_lazy_loading",
  "noindex_set",
  "non_self_canonical",
  "old_image_formats",
  "orphan_pages",
  "partial_ai_crawler_policy",
  "render_blocking_scripts",
  "short_meta_description",
  "short_title",
  "slow_response",
  "soft_404",
  "thin_content",
  "viewport_blocks_zoom",
  "weak_anchor_text",
  "xrobots_noindex",

  // Tech-stack checks, from lib/tech-audit-rules.ts.
  //
  // Emitted for a long time without being listed here, so nothing
  // downstream could explain or fix them and users were told "we haven't
  // written the fix guide for this check yet" on all sixteen. The drift
  // test that exists to catch exactly this only read lib/audit.ts.
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
] as const;

export type AuditFindingType = (typeof AUDIT_FINDING_TYPES)[number];

const TYPE_SET: ReadonlySet<string> = new Set(AUDIT_FINDING_TYPES);

export function isAuditFindingType(value: string): value is AuditFindingType {
  return TYPE_SET.has(value);
}

/**
 * Finding types produced by tools OTHER than the site crawler, which
 * legitimately have explainers without appearing in the list above.
 *
 * Listed explicitly so the drift test can tell "this belongs to the Core
 * Web Vitals tool" apart from "somebody typed the name wrong", which is
 * the mistake that hid four separate bugs here.
 */
export const NON_CRAWLER_FINDING_TYPES = [
  // Core Web Vitals tool (field data from CrUX / PageSpeed).
  "poor_cls",
  "poor_inp",
  "slow_lcp",
  // Redirect tracer.
  "redirect_chain",
] as const;
