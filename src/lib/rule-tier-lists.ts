/**
 * The three hand-kept lists behind lib/rule-tiers.ts, in a file with no
 * imports so lib/advisory-rules.ts can read them without a cycle.
 * A rule in none of them is an SEO rule. See lib/rule-tiers.ts.
 */

/** Helps search indirectly, or for some sites only. Scored. */
export const COMPLEMENTARY_RULES: ReadonlySet<string> = new Set([
  // Content: weaker signals and editorial polish, not ranking rules.
  "content-date-agreement", "content-description-pixel-width", "content-heading-length", "content-heading-unique",
  "content-reading-level", "content-title-pattern", "content-title-pixel-width",
  // Structured data: optional types, and cross-page entity consistency.
  "schema-entity-conflict", "schema-entity-dangling", "schema-entity-id", "schema-entity-split",
  "schema-entity-type-drift", "schema-faq", "schema-video",
  // Trust signals (E-E-A-T): Google's raters read them; no direct ranking rule.
  "eeat-about-page", "eeat-affiliate-disclosure", "eeat-contact-page", "eeat-disclaimers", "eeat-privacy-policy",
  "eeat-terms-of-service", "eeat-trust-signals", "eeat-ymyl-detection",
  // Crawl
  "crawl-pdf-size",
  // HTML validity: matters when it breaks the head Google reads (those stay seo).
  "htmlval-body-structure", "htmlval-missing-charset", "htmlval-missing-doctype", "htmlval-noscript-in-head",
  "htmlval-size-limit",
  // Visibility in AI answers: what the tool sells, not Google ranking.
  "geo-ai-bot-access", "geo-content-signals", "geo-content-structure", "geo-schema-drift", "geo-semantic-html",
  // Images: secondary to alt text, dimensions and lazy loading (seo).
  "images-alt-length", "images-background-seo", "images-figure-captions", "images-filename-quality",
  "images-inline-svg-size", "images-oversized-delivery", "images-picture-element",
  // Links: hygiene rather than ranking.
  "links-chrome-inbound", "links-excessive", "links-external-count", "links-local-file", "links-localhost",
  "links-non-http-protocol", "links-tel-mailto", "links-whitespace-href",
  // Performance: what feeds Core Web Vitals in the field; the vitals themselves are seo.
  "cwv-fcp", "perf-asset-cache-policy", "perf-asset-compression", "perf-brotli", "perf-cache-policy",
  "perf-css-file-size", "perf-dom-size", "perf-duplicate-js", "perf-font-loading", "perf-http2",
  "perf-image-encoding", "perf-js-file-size", "perf-legacy-javascript", "perf-minify-css", "perf-minify-js",
  "perf-preconnect", "perf-text-compression", "perf-unused-css", "perf-unused-js", "perf-video-for-animations",
  // URL shape: readability; duplicates and crawl traps stay seo.
  "url-length", "url-non-ascii", "url-repetitive-path", "url-slug-keywords", "url-stop-words", "url-underscores",
]);

/** Good practice with no effect on Google. Outside the score, report and tasks. */
export const INFORMATIVE_RULES: ReadonlySet<string> = new Set([
  // Accessibility: for visitors; Google does not rank on it. Descriptive
  // link text (a11y-link-text) is the exception: Lighthouse's SEO audit
  // checks it, so it stays seo.
  "a11y-accesskey-unique", "a11y-aria-hidden-body", "a11y-aria-hidden-focusable", "a11y-aria-labels",
  "a11y-aria-required", "a11y-aria-valid", "a11y-autocomplete", "a11y-axe-aria", "a11y-axe-frames",
  "a11y-axe-keyboard", "a11y-axe-landmarks", "a11y-axe-language", "a11y-axe-lists", "a11y-axe-media",
  "a11y-axe-names", "a11y-axe-other", "a11y-axe-tables", "a11y-button-name", "a11y-color-contrast",
  "a11y-duplicate-id", "a11y-empty-heading", "a11y-focus-visible", "a11y-form-labels", "a11y-form-multiple-labels",
  "a11y-heading-order", "a11y-identical-links-purpose", "a11y-iframe-title", "a11y-input-image-alt",
  "a11y-label-name-mismatch", "a11y-landmark-regions", "a11y-list-structure", "a11y-main-landmark",
  "a11y-object-alt", "a11y-presentation-role-conflict", "a11y-redundant-alt", "a11y-skip-link", "a11y-svg-img-alt",
  "a11y-tabindex-positive", "a11y-table-caption", "a11y-table-headers", "a11y-touch-targets",
  "a11y-valid-lang-element", "a11y-video-captions", "a11y-xml-lang-mismatch", "a11y-zoom-disabled",
  // Robots directives Google has said it ignores.
  "core-obsolete-robots-directives",
  // Text-to-HTML ratio: not a ranking factor (Google, repeatedly). A stale
  // copyright year: cosmetic.
  "content-stale-copyright", "content-text-html-ratio",
  // Sitelinks search box: Google stopped showing it in 2024.
  "schema-website-search",
  // Files and formats for AI agents: no search engine reads them today.
  "geo-agents-md", "geo-llms-txt", "geo-markdown-page", "geo-markdown-response", "geo-well-known",
  "perf-source-maps",
  // Social previews: for sharing, not for search.
  "social-duplicate-og", "social-meta-multiple", "social-og-description", "social-og-image",
  "social-og-image-reachable", "social-og-image-size", "social-og-title", "social-og-url", "social-og-url-canonical",
  "social-profiles", "social-share-buttons", "social-twitter-attribute", "social-twitter-card",
  // Analytics and forms: measurement, not search.
  "technical-consent-mode", "technical-duplicate-ga", "technical-duplicate-gtm", "technical-form-get-method",
]);

/** Off-topic for SEO: a security or legal audit. Shown apart. */
export const OFF_TOPIC_RULES: ReadonlySet<string> = new Set([
  // Licences and opt-outs for AI crawlers: a publishing decision.
  "geo-noai-signals", "geo-pay-per-crawl", "geo-rsl-license",
  "legal-cookie-consent",
  // Security headers and cookies. HTTPS, the HTTPS redirect, mixed
  // content, an expiring certificate and signs of a hacked site stay seo:
  // Google uses HTTPS and flags hacked sites.
  "security-cookie-flags", "security-cookie-lifetime", "security-coop", "security-csp", "security-csp-xss",
  "security-external-links", "security-form-https", "security-hsts", "security-info-disclosure",
  "security-leaked-secrets", "security-password-http", "security-paste-blocking", "security-permissions-policy",
  "security-protocol-relative", "security-referrer-policy", "security-sri", "security-ssl-protocol",
  "security-trusted-types", "security-x-content-type-options", "security-x-frame-options",
]);
