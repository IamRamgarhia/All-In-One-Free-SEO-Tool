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
 */
export const ADVISORY_RULES: ReadonlySet<string> = new Set([
  // Security headers and cookies: protect users, not ranking.
  "security-coop",
  "security-form-https",
  "security-cookie-flags",
  "security-cookie-lifetime",
  "security-external-links",
  "security-csp",
  "security-protocol-relative",
  "security-sri",
  "security-leaked-secrets",
  "security-permissions-policy",
  "security-csp-xss",
  "security-referrer-policy",
  "security-paste-blocking",
  "security-hsts",
  "security-info-disclosure",
  "security-x-content-type-options",
  "security-ssl-protocol",
  "security-x-frame-options",
  "security-password-http",
  "security-trusted-types",
  // Accessibility: right to do, and required in some cases, but not a
  // ranking criterion. Descriptive link text stays scored (see above).
  "a11y-aria-labels",
  "a11y-accesskey-unique",
  "a11y-aria-required",
  "a11y-aria-hidden-focusable",
  "a11y-aria-hidden-body",
  "a11y-color-contrast",
  "a11y-aria-valid",
  "a11y-autocomplete",
  "a11y-duplicate-id",
  "a11y-form-labels",
  "a11y-iframe-title",
  "a11y-form-multiple-labels",
  "a11y-landmark-regions",
  "a11y-label-name-mismatch",
  "a11y-heading-order",
  "a11y-focus-visible",
  "a11y-object-alt",
  "a11y-input-image-alt",
  "a11y-main-landmark",
  "a11y-skip-link",
  "a11y-empty-heading",
  "a11y-button-name",
  "a11y-identical-links-purpose",
  "a11y-presentation-role-conflict",
  "a11y-list-structure",
  "a11y-redundant-alt",
  "a11y-svg-img-alt",
  "a11y-table-caption",
  "a11y-table-headers",
  "a11y-video-captions",
  "a11y-xml-lang-mismatch",
  "a11y-touch-targets",
  "a11y-zoom-disabled",
  "a11y-tabindex-positive",
  "a11y-valid-lang-element",
  // Social sharing: how a link looks when shared, not how a page ranks.
  "social-og-image-size",
  "social-og-description",
  "social-og-image",
  "social-og-url-canonical",
  "social-profiles",
  "social-og-title",
  "social-og-url",
  "social-share-buttons",
  "social-twitter-card",
  // Files and signals for AI agents that no engine is shown to use.
  "geo-agents-md",
  "geo-markdown-response",
  "geo-markdown-page",
  "geo-well-known",
  "geo-llms-txt",
  "geo-rsl-license",
  "geo-pay-per-crawl",
  "geo-noai-signals",
  // Legal compliance, not search.
  "legal-cookie-consent",
  // Text-to-HTML ratio: Google has said many times it is not a ranking
  // factor. Measured on the rendered page it mostly counts the framework's
  // scripts (nd-prestige.com: 4%, 184 KB of HTML for 7 KB of text).
  "content-text-html-ratio",
]);

export function isAdvisoryRule(ruleId: string): boolean {
  return ADVISORY_RULES.has(ruleId);
}
