/**
 * Which tool to open for a given audit finding.
 *
 * Every task the audit generates says what is wrong and why it matters,
 * and then leaves the reader to work out where in a ninety-one tool app
 * they go to do something about it. That is the gap between a list of
 * problems and a thing somebody can work through.
 *
 * Kept as its own map rather than folded into the task blueprints,
 * because the same mapping is wanted in three places — the task row, the
 * findings board, and the ranked list — and this repo's fourth standing
 * rule exists because every pair of lists in it had already drifted.
 *
 * Deliberately incomplete. A finding with no obvious tool gets no
 * button, which is honest. Sending somebody to a page that cannot help
 * with their problem is worse than sending them nowhere: they lose the
 * time and the trust.
 */

/** Finding type → the route that actually helps with it. */
const TOOL_FOR_FINDING: Record<string, string> = {
  // --- Head tags, all edited in the same place -----------------------
  missing_title: "/tools/meta-tag-generator",
  short_title: "/tools/meta-tag-generator",
  long_title: "/tools/meta-tag-generator",
  duplicate_title: "/tools/meta-tag-generator",
  missing_meta_description: "/tools/meta-tag-generator",
  short_meta_description: "/tools/meta-tag-generator",
  long_meta_description: "/tools/meta-tag-generator",
  duplicate_meta_description: "/tools/meta-tag-generator",
  missing_og_tags: "/tools/social-preview",
  missing_twitter_card: "/tools/social-preview",

  // --- Indexing ------------------------------------------------------
  missing_canonical: "/tools/canonical-audit",
  non_self_canonical: "/tools/canonical-audit",
  invalid_canonical: "/tools/canonical-audit",
  canonical_chain: "/tools/canonical-audit",
  noindex_set: "/tools/health-check",
  xrobots_noindex: "/tools/headers",
  blocked_by_robots: "/tools/robots",
  missing_robots_txt: "/tools/robots",
  invalid_robots_txt: "/tools/robots",
  missing_sitemap: "/tools/sitemap",
  missing_ai_crawler_policy: "/tools/ai-robots",
  partial_ai_crawler_policy: "/tools/ai-robots",

  // --- Structure and content -----------------------------------------
  missing_schema: "/tools/schema",
  article_missing_author: "/tools/schema",
  thin_content: "/tools/content-grader",
  missing_h1: "/tools/health-check",
  heading_order: "/tools/health-check",
  orphan_pages: "/tools/internal-linking",
  weak_anchor_text: "/tools/internal-linking",
  broken_link: "/tools/link-checker",
  redirect_chain: "/tools/redirects-manager",
  soft_404: "/tools/soft-404",

  // --- Media and speed -----------------------------------------------
  missing_image_alt: "/tools/bulk-alt",
  old_image_formats: "/tools/bulk-alt",
  no_lazy_loading: "/tools/perf-budget",
  image_missing_dimensions: "/tools/perf-budget",
  slow_lcp: "/tools/crux",
  poor_cls: "/tools/crux",
  poor_inp: "/tools/crux",
  slow_response: "/tools/uptime",
  render_blocking_scripts: "/tools/perf-budget",
  heavy_html_payload: "/tools/perf-budget",

  // --- Server and security -------------------------------------------
  missing_security_headers: "/tools/security",
  no_https: "/tools/security",
  mixed_content: "/tools/security",

  // --- International --------------------------------------------------
  hreflang_not_reciprocal: "/tools/hreflang",
  inconsistent_hreflang: "/tools/hreflang",
  missing_lang: "/tools/hreflang",

  // --- Rendering -------------------------------------------------------
  js_rendered_only: "/tools/render",
  spa_empty_body: "/tools/render",

  // --- WordPress --------------------------------------------------------
  wp_xmlrpc_exposed: "/tools/wp-hack-scan",
  wp_version_disclosed: "/tools/wp-hack-scan",
  wp_rest_api_advertised: "/tools/wp-hack-scan",
  wp_multiple_seo_plugins: "/tools/wp-hack-scan",
};

/**
 * The tool for this finding, or null when none of them helps.
 *
 * Null is a real answer and the common one for platform findings —
 * `next_chunk_explosion` is fixed in a Next.js repo, not in this app,
 * and offering a button that opens something irrelevant wastes the
 * click and the trust.
 */
export function toolForFinding(type: string): string | null {
  return TOOL_FOR_FINDING[type] ?? null;
}

/** Every finding type that has a tool, for the coverage test. */
export function mappedFindingTypes(): string[] {
  return Object.keys(TOOL_FOR_FINDING);
}
