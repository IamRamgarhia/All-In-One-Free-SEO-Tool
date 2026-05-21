/**
 * Confidence classifier for audit issues. Maps every known issue type
 * to one of three confidence tiers:
 *
 *   "definitely" — objective, Google-documented, no reasonable false
 *                  positive (HTTP errors, missing canonical, noindex
 *                  set, invalid hreflang, mixed content, etc.)
 *   "probably"   — best-practice heuristic; could be a deliberate
 *                  design choice (title length, image alt missing on
 *                  decorative imagery, multiple H1s in HTML5)
 *   "test"       — AI-generated suggestion or pattern-matched guess;
 *                  user should verify before acting
 *
 * The intent is to enforce the CLAUDE.md "Definitely fix / Probably /
 * Worth testing" trichotomy at the data layer. Without this, every
 * issue presents as equal-weight and we get the user-reported
 * "tool flags too many false positives" perception even when the
 * findings are technically correct.
 *
 * When you add a new audit check, add its type here. Unknown types
 * fall back to severity-based defaults so the system stays safe.
 */

export type AuditConfidence = "definitely" | "probably" | "test";

const DEFINITELY: ReadonlySet<string> = new Set([
  // HTTP / transport — objective measurement
  "bad_status",
  "no_https",
  "slow_response",
  "mixed_content",
  // Required tags / directives — either present or not
  "missing_title",
  "missing_meta_description",
  "missing_canonical",
  "missing_viewport",
  "missing_lang",
  "noindex_set",
  "xrobots_noindex",
  // Canonical correctness — measurable
  "invalid_canonical",
  // Accessibility violations — WCAG-defined
  "viewport_blocks_zoom",
]);

const PROBABLY: ReadonlySet<string> = new Set([
  // Title / meta length heuristics
  "short_title",
  "long_title",
  "short_meta_description",
  "long_meta_description",
  // Heading order — multi-H1 is valid HTML5 but discouraged
  "heading_order",
  // Nice-to-haves
  "missing_favicon",
  "missing_og_tags",
  "missing_twitter_card",
  "missing_schema",
  // Image hygiene — context-dependent
  "missing_image_alt",
  "no_lazy_loading",
  "old_image_formats",
  "image_missing_dimensions",
  // Content quality heuristics
  "thin_content",
  "weak_anchor_text",
  // Canonical to a different URL — could be intentional
  "non_self_canonical",
  // JS-only rendering — depends on SSR strategy
  "js_rendered_only",
  // Perf heuristics
  "render_blocking_scripts",
  "heavy_html_payload",
  // EEAT signal — context-dependent
  "article_missing_author",
]);

/**
 * Classifier. Returns the confidence tier for an audit issue.
 *
 * Rules in priority order:
 *   1. AI-generated issues → "test" (always; user must verify)
 *   2. Issue type in DEFINITELY map → "definitely"
 *   3. Issue type in PROBABLY map → "probably"
 *   4. Unknown type → derive from severity:
 *      critical/high → "probably" (assume best-practice unless we know otherwise)
 *      medium/low → "test"
 */
export function confidenceForIssue(input: {
  type: string;
  aiGenerated?: boolean;
  severity?: "critical" | "high" | "medium" | "low";
}): AuditConfidence {
  if (input.aiGenerated) return "test";
  if (DEFINITELY.has(input.type)) return "definitely";
  if (PROBABLY.has(input.type)) return "probably";
  // Unknown type — be conservative
  if (input.severity === "critical" || input.severity === "high") {
    return "probably";
  }
  return "test";
}

/**
 * Human-readable reason for the confidence level — used in the
 * ConfidenceBadge tooltip so the user understands *why* this is rated
 * the way it is.
 */
export function confidenceReason(
  conf: AuditConfidence,
  type: string,
  aiGenerated: boolean,
): string {
  if (aiGenerated) {
    return "AI-generated suggestion — verify against your specific page context before acting.";
  }
  if (conf === "definitely") {
    return `Objective measurement of "${type}" — no reasonable false positive. Safe to act on.`;
  }
  if (conf === "probably") {
    return `Best-practice heuristic for "${type}" — could be a deliberate design choice. Confirm before fixing.`;
  }
  return `Pattern-matched suggestion for "${type}" — treat as a hypothesis to test.`;
}
