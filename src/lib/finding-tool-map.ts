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
  facet_trap: "/tools/facet-trap",
  stale_content: "/tools/freshness",

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

// ---------------------------------------------------------------------
// The audit engine's rules (`seomator:<rule id>`) and the GEO engine's
// signals (`geo:<signal>`).
//
// Same standard as the crawler map above: a rule gets a tool only when
// that tool shows or changes the very thing the rule is about. Whole
// families stay unmapped on purpose — accessibility, HTML validity, URL
// shape, cookies, legal — because no tool here helps with them, and a
// button that opens something beside the point costs the click and the
// trust.
// ---------------------------------------------------------------------

/** Engine rule id → tool. Listed rule by rule so the test can check each id exists. */
const TOOL_FOR_ENGINE_RULE: Record<string, string> = {
  // Head tags
  "core-title-present": "/tools/meta-tag-generator",
  "core-title-length": "/tools/meta-tag-generator",
  "core-title-unique": "/tools/meta-tag-generator",
  "core-description-present": "/tools/meta-tag-generator",
  "core-description-length": "/tools/meta-tag-generator",
  "content-duplicate-description": "/tools/meta-tag-generator",
  "content-title-same-as-description": "/tools/meta-tag-generator",
  "content-title-same-as-h1": "/tools/meta-tag-generator",
  "content-title-pixel-width": "/tools/pixel-preview",
  "content-description-pixel-width": "/tools/pixel-preview",

  // Canonicals
  "core-canonical-present": "/tools/canonical-audit",
  "core-canonical-valid": "/tools/canonical-audit",
  "core-canonical-multiple": "/tools/canonical-audit",
  "core-canonical-conflicting": "/tools/canonical-audit",
  "core-canonical-external": "/tools/canonical-audit",
  "core-canonical-http-mismatch": "/tools/canonical-audit",
  "core-canonical-loop": "/tools/canonical-audit",
  "core-canonical-to-noindex": "/tools/canonical-audit",
  "core-canonical-to-homepage": "/tools/canonical-audit",
  "crawl-canonical-chain": "/tools/canonical-audit",
  "crawl-canonical-loop": "/tools/canonical-audit",
  "crawl-canonical-redirect": "/tools/canonical-audit",
  "crawl-canonical-to-noindex": "/tools/canonical-audit",
  "core-canonical-header": "/tools/headers",

  // Headings and indexing on the page
  "core-h1-present": "/tools/health-check",
  "core-h1-single": "/tools/health-check",
  "core-robots-meta": "/tools/health-check",
  "content-duplicate-h1": "/tools/health-check",
  "content-heading-hierarchy": "/tools/health-check",

  // robots.txt and sitemaps
  "technical-robots-txt-exists": "/tools/robots",
  "technical-robots-txt-valid": "/tools/robots",
  "crawl-sitemap-in-robotstxt": "/tools/robots",
  "technical-sitemap-exists": "/tools/sitemap",
  "technical-sitemap-valid": "/tools/robots",
  "technical-soft-404": "/tools/soft-404",
  "technical-www-redirect": "/tools/headers",

  // International
  "i18n-hreflang": "/tools/hreflang",
  "i18n-hreflang-return-links": "/tools/hreflang",
  "i18n-hreflang-x-default": "/tools/hreflang",
  "i18n-hreflang-conflicting": "/tools/hreflang",
  "i18n-hreflang-relative-url": "/tools/hreflang",
  "i18n-hreflang-lang-mismatch": "/tools/hreflang",
  "i18n-lang-attribute": "/tools/hreflang",
  "crawl-hreflang-reciprocity": "/tools/hreflang",

  // Links
  "links-broken-internal": "/tools/link-checker",
  "links-invalid": "/tools/link-checker",
  "links-broken-fragment": "/tools/link-checker",
  "links-external-valid": "/tools/link-checker",
  "links-orphan-pages": "/tools/internal-linking",
  "links-weak-inbound": "/tools/internal-linking",
  "links-dead-end-pages": "/tools/internal-linking",
  "links-depth": "/tools/internal-linking",
  "links-anchor-text": "/tools/internal-linking",
  "links-inbound-anchor-text": "/tools/internal-linking",
  "crawl-isolated-url": "/tools/internal-linking",

  // Redirects
  "links-redirect-chains": "/tools/redirects-manager",
  "redirect-loop": "/tools/redirects-manager",
  "redirect-broken": "/tools/redirects-manager",
  "redirect-type": "/tools/redirects-manager",

  // Images
  "images-alt-present": "/tools/bulk-alt",
  "images-alt-quality": "/tools/bulk-alt",
  "images-alt-length": "/tools/bulk-alt",
  "images-modern-format": "/tools/bulk-alt",
  "images-dimensions": "/tools/perf-budget",
  "images-lazy-loading": "/tools/perf-budget",
  "images-size": "/tools/perf-budget",

  // Speed
  "cwv-lcp": "/tools/crux",
  "cwv-cls": "/tools/crux",
  "cwv-inp": "/tools/crux",
  "cwv-fcp": "/tools/crux",
  "cwv-ttfb": "/tools/crux",
  "perf-response-time": "/tools/uptime",
  "perf-render-blocking": "/tools/perf-budget",
  "perf-page-weight": "/tools/perf-budget",
  "perf-js-file-size": "/tools/perf-budget",
  "perf-css-file-size": "/tools/perf-budget",

  // Structured data
  "schema-present": "/tools/schema",
  "schema-organization": "/tools/schema",
  "schema-article": "/tools/schema",
  "schema-breadcrumb": "/tools/schema",
  "schema-faq": "/tools/schema",
  "schema-local-business": "/tools/schema",
  "schema-product": "/tools/schema",
  "schema-valid": "/tools/schema-validate",
  "schema-required-fields": "/tools/schema-validate",
  "schema-type": "/tools/schema-validate",

  // Security headers and HTTPS
  "security-https": "/tools/security",
  "security-https-redirect": "/tools/security",
  "security-mixed-content": "/tools/security",
  "security-hsts": "/tools/security",
  "security-csp": "/tools/security",
  "security-x-frame-options": "/tools/security",
  "security-x-content-type-options": "/tools/security",
  "security-referrer-policy": "/tools/security",
  "security-permissions-policy": "/tools/security",
  "security-ssl-expiry": "/tools/security",
  "security-ssl-protocol": "/tools/security",

  // Social cards
  "social-og-title": "/tools/social-preview",
  "social-og-description": "/tools/social-preview",
  "social-og-image": "/tools/social-preview",
  "social-og-url": "/tools/social-preview",
  "social-twitter-card": "/tools/social-preview",

  // JavaScript rendering
  "js-ssr-check": "/tools/render",
  "js-rendered-content": "/tools/render",
  "js-rendered-title": "/tools/render",
  "js-rendered-description": "/tools/render",
  "js-rendered-h1": "/tools/render",
  "js-rendered-links": "/tools/render",
  "js-rendered-canonical": "/tools/render",

  // Mobile
  "core-viewport-present": "/tools/mobile-friendly",
  "mobile-viewport-width": "/tools/mobile-friendly",
  "mobile-font-size": "/tools/mobile-friendly",
  "mobile-horizontal-scroll": "/tools/mobile-friendly",
  "mobile-interstitials": "/tools/mobile-friendly",

  // Authors and trust
  "eeat-author-byline": "/tools/person-schema",
  "eeat-author-expertise": "/tools/person-schema",
  "eeat-about-page": "/tools/eeat-audit",
  "eeat-contact-page": "/tools/eeat-audit",
  "eeat-citations": "/tools/eeat-audit",
  "eeat-trust-signals": "/tools/eeat-audit",
  "eeat-content-dates": "/tools/freshness",

  // Content
  "content-word-count": "/tools/content-grader",
  "content-thin-vs-site": "/tools/content-grader",

  // AI search
  "geo-llms-txt": "/tools/llms-txt",
  "geo-ai-bot-access": "/tools/ai-robots",
  "geo-noai-signals": "/tools/ai-robots",
  "geo-content-structure": "/tools/aio-passage",
  "geo-schema-drift": "/tools/schema-validate",
};

/** GEO signal id (lib/geo-audit) → tool. */
const TOOL_FOR_GEO_SIGNAL: Record<string, string> = {
  "technical.crawler_access": "/tools/ai-robots",
  "technical.indexability": "/tools/health-check",
  "technical.metadata": "/tools/meta-tag-generator",
  "technical.transport_security": "/tools/security",
  "technical.status_health": "/tools/headers",
  "schema.presence": "/tools/schema",
  "schema.breadth": "/tools/schema",
  "schema.organization": "/tools/schema",
  "schema.article": "/tools/schema",
  "schema.validity": "/tools/schema-validate",
  "content.freshness": "/tools/freshness",
  "content.expertise": "/tools/eeat-audit",
  "content.depth": "/tools/content-grader",
  "citability.attribution": "/tools/eeat-audit",
  "citability.render_parity": "/tools/render",
  "citability.answer_first": "/tools/aio-passage",
  "citability.self_containment": "/tools/aio-passage",
  "citability.extractability": "/tools/aio-passage",
  "citability.structure": "/tools/aio-passage",
};

/**
 * The tool for any finding type the app stores: a crawler type, an engine
 * rule (`seomator:<rule id>`) or a GEO signal (`geo:<signal>`). Null when
 * none of them helps.
 */
export function toolForAnyFinding(type: string): string | null {
  if (type.startsWith("seomator:")) {
    return TOOL_FOR_ENGINE_RULE[type.slice("seomator:".length)] ?? null;
  }
  if (type.startsWith("geo:")) {
    return TOOL_FOR_GEO_SIGNAL[type.slice("geo:".length)] ?? null;
  }
  return toolForFinding(type);
}

/** Engine rule ids with a tool, for the test. */
export function mappedEngineRules(): string[] {
  return Object.keys(TOOL_FOR_ENGINE_RULE);
}

/** GEO signal ids with a tool, for the test. */
export function mappedGeoSignals(): string[] {
  return Object.keys(TOOL_FOR_GEO_SIGNAL);
}

// ---------------------------------------------------------------------
// Links that carry the client
// ---------------------------------------------------------------------

/**
 * Whether a tool changes the thing ("Fix with…") or helps understand it
 * ("Dig into it with…"). A generator writes the tag, the redirect or the
 * file; an analyser shows what is wrong. Saying "fix" for an analyser
 * would promise something the page does not do.
 */
const FIXING_TOOLS: ReadonlySet<string> = new Set([
  "/tools/meta-tag-generator",
  "/tools/schema",
  "/tools/person-schema",
  "/tools/social-preview",
  "/tools/redirects-manager",
  "/tools/bulk-alt",
  "/tools/sitemap",
  "/tools/llms-txt",
  "/tools/freshness",
  "/tools/gbp-reply",
  "/tools/og-image",
]);

export type ToolVerb = "fix" | "dig";

export function toolVerb(toolPath: string): ToolVerb {
  return FIXING_TOOLS.has(toolPath.split(/[?#]/)[0]) ? "fix" : "dig";
}

/** The tool's slug in the catalogue (`tools.catalog.<slug>`), or null outside /tools. */
export function toolSlug(toolPath: string): string | null {
  const m = /^\/tools\/([a-z0-9-]+)(?:[/?#]|$)/.exec(toolPath);
  return m ? m[1] : null;
}

export type ToolContext = {
  clientId?: number | null;
  /** The page the work is about; the client's site when there is none. */
  url?: string | null;
  taskId?: number | null;
  /** The finding type the link was built from. */
  finding?: string | null;
};

/**
 * A tool path with the client, the page and the task added to its query
 * string, so the tool opens on that page, inside that client's file.
 *
 * Only /tools/* pages read these; any other path (a client view, the
 * audits list) is returned as it is, apart from the client id the
 * launcher already used to add.
 */
export function withToolContext(toolPath: string, ctx: ToolContext): string {
  const [pathAndQuery, hash] = toolPath.split("#", 2);
  const [path, query] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query ?? "");
  const isTool = path.startsWith("/tools/");
  if (ctx.clientId && ctx.clientId > 0 && !params.has("clientId")) {
    params.set("clientId", String(ctx.clientId));
  }
  if (isTool) {
    const url = ctx.url ? safeHttpUrl(ctx.url) : null;
    if (url && !params.has("url")) params.set("url", url);
    if (ctx.taskId && ctx.taskId > 0) params.set("task", String(ctx.taskId));
    if (ctx.finding && /^[a-z0-9_:.-]{1,120}$/i.test(ctx.finding)) params.set("finding", ctx.finding);
  }
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * The button for a finding: where it goes, with the client's context, and
 * whether it reads "Fix with…" or "Dig into it with…". Null when no tool
 * helps, in which case no button is shown.
 */
export function toolLink(
  type: string,
  ctx: ToolContext = {},
): { href: string; toolPath: string; verb: ToolVerb } | null {
  const toolPath = toolForAnyFinding(type);
  if (!toolPath) return null;
  return {
    href: withToolContext(toolPath, { ...ctx, finding: ctx.finding ?? type }),
    toolPath,
    verb: toolVerb(toolPath),
  };
}

/** An http(s) URL, normalised, or null. Anything else is dropped. */
export function safeHttpUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > 2048) return null;
  try {
    const u = new URL(text);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** The finding a task was made from, from its `sourceRef` (`audit:<type>`, `seomator:…`, `geo:…`, `tool:<slug>|<finding>`). */

/** The page a task's tool should open: its first page still to fix, else its first page. */
export function taskPageUrl(pages: readonly { url: string; done: boolean }[] | null | undefined): string | null {
  if (!pages || pages.length === 0) return null;
  return (pages.find((p) => !p.done) ?? pages[0]).url;
}

export function findingFromSourceRef(sourceRef: string | null | undefined): string | null {
  if (!sourceRef) return null;
  // A task added from a tool: `tool:<slug>|<finding>` (lib/tool-context.ts).
  if (sourceRef.startsWith("tool:")) {
    const finding = sourceRef.split("|")[1];
    return finding ? findingFromSourceRef(finding) ?? finding : null;
  }
  if (sourceRef.startsWith("audit:")) return sourceRef.slice("audit:".length) || null;
  if (sourceRef.startsWith("seomator:") || sourceRef.startsWith("geo:")) return sourceRef;
  return null;
}

/**
 * The tool button of a task, carrying the client, the page and the task.
 *
 * Engine tasks written before their rules had a tool point at "/audits";
 * when the finding they came from has one now, the button opens it.
 */
export function taskToolLink(task: {
  id: number;
  toolPath: string | null | undefined;
  sourceRef?: string | null;
  clientId: number | null;
  /** The task's first page, or the client's site. */
  pageUrl?: string | null;
}): { href: string; toolPath: string; verb: ToolVerb; isTool: boolean } | null {
  const finding = findingFromSourceRef(task.sourceRef);
  const mapped = finding ? toolForAnyFinding(finding) : null;
  const stored = task.toolPath && task.toolPath !== "/audits" ? task.toolPath : null;
  const toolPath = stored ?? mapped ?? task.toolPath ?? null;
  if (!toolPath) return null;
  return {
    href: withToolContext(toolPath, {
      clientId: task.clientId,
      url: task.pageUrl ?? null,
      taskId: task.id,
      finding,
    }),
    toolPath,
    verb: toolVerb(toolPath),
    isTool: toolSlug(toolPath) !== null,
  };
}
