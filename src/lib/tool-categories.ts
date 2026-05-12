/**
 * Tool category assignments. Source of truth for both the /tools index
 * page (which groups tools under section headers) and the sidebar
 * (future grouping work).
 *
 * Categories are listed in the order users should typically reach for
 * them — most-used first.
 */

export type ToolCategoryId =
  | "everyday"
  | "audit"
  | "ai-geo"
  | "content"
  | "keywords"
  | "backlinks"
  | "technical"
  | "generators"
  | "migration"
  | "local"
  | "specialty";

export const CATEGORY_LABELS: Record<ToolCategoryId, { label: string; description: string }> = {
  everyday: {
    label: "Everyday essentials",
    description: "Start here. Tools you'll use weekly.",
  },
  audit: {
    label: "Audits & scoring",
    description: "Full-page audits, GEO/SXO/E-E-A-T scoring, health checks.",
  },
  "ai-geo": {
    label: "AI search & GEO (2026)",
    description: "Get cited in ChatGPT / Perplexity / AI Overviews; manage AI bots.",
  },
  content: {
    label: "Content",
    description: "Writing, briefs, grading, plagiarism + AI detection.",
  },
  keywords: {
    label: "Keywords & research",
    description: "Research, intent, clusters, SERP features, search volume.",
  },
  backlinks: {
    label: "Backlinks & outreach",
    description: "Discovery, anchor profile, disavow, outreach personalization.",
  },
  technical: {
    label: "Technical SEO",
    description: "CWV, security headers, DNS, link graph, broken links, render checks.",
  },
  generators: {
    label: "Generators (code / meta / images)",
    description: "Plugin/HTML/snippet generators, meta-tag rewriter, OG / DALL-E images.",
  },
  migration: {
    label: "Indexing, redirects, migration",
    description: "Robots / sitemap / IndexNow / GSC coverage / hreflang / migration mapping.",
  },
  local: {
    label: "Local SEO",
    description: "Local Core Web Vitals + local-rank-grid tools.",
  },
  specialty: {
    label: "Specialty / experimental",
    description: "YouTube, Bing, browser agent, GitHub PRs, screenshot import.",
  },
};

/** Explicit overrides per tool href. Everything not listed here falls
 * through to a heuristic mapper below. */
const EXPLICIT: Record<string, ToolCategoryId> = {
  // Everyday essentials — used most often
  "/tools/health-check": "everyday",
  "/tools/rank-where": "everyday",
  "/tools/code-generator": "everyday",
  "/tools/meta-tag-generator": "everyday",
  "/tools/content-attack-brief": "everyday",
  "/tools/serp-features": "everyday",

  // Audits & scoring
  "/tools/eeat-audit": "audit",
  "/tools/sxo": "audit",
  "/tools/geo-score": "audit",
  "/tools/content-grader": "audit",
  "/tools/content-score": "audit",
  "/tools/expert-panel": "audit",
  "/tools/canonical-audit": "audit",
  "/tools/youtube-audit": "audit",

  // AI / GEO
  "/tools/ai-overview": "ai-geo",
  "/tools/ai-citation-tactics": "ai-geo",
  "/tools/aio-passage": "ai-geo",
  "/tools/person-schema": "ai-geo",
  "/tools/reputation-abuse-risk": "ai-geo",
  "/tools/llms-txt": "ai-geo",
  "/tools/ai-slop": "ai-geo",
  "/tools/reddit-research": "ai-geo",
  "/tools/schema": "ai-geo",
  "/tools/schema-validate": "ai-geo",
  "/tools/ai-schema": "ai-geo",

  // Content
  "/tools/brief": "content",
  "/tools/attack-briefs": "content",
  "/tools/refresh": "content",
  "/tools/plagiarism": "content",
  "/tools/summarizer": "content",
  "/tools/news-headline": "content",
  "/tools/content-helpers": "content",
  "/tools/trending": "content",

  // Keywords & research
  "/tools/keyword-difficulty": "keywords",
  "/tools/search-volume": "keywords",
  "/tools/intent-classifier": "keywords",
  "/tools/cluster": "keywords",
  "/tools/branded-split": "keywords",
  "/tools/youtube": "keywords",
  "/tools/serp-volatility": "keywords",
  "/tools/cannibalization": "keywords",

  // Backlinks & outreach
  "/tools/backlink-discovery": "backlinks",
  "/tools/anchor-distribution": "backlinks",
  "/tools/disavow": "backlinks",
  "/tools/outreach-personalize": "backlinks",

  // Technical SEO
  "/tools/local-cwv": "technical",
  "/tools/security": "technical",
  "/tools/headers": "technical",
  "/tools/dns-whois": "technical",
  "/tools/domain-overview": "technical",
  "/tools/mobile-friendly": "technical",
  "/tools/crux": "technical",
  "/tools/crux-origin": "technical",
  "/tools/perf-budget": "technical",
  "/tools/render": "technical",
  "/tools/wayback": "technical",
  "/tools/uptime": "technical",
  "/tools/wp-hack-scan": "technical",
  "/tools/link-checker": "technical",
  "/tools/soft-404": "technical",
  "/tools/facet-trap": "technical",
  "/tools/bulk-scan": "technical",
  "/tools/auto-link": "technical",
  "/tools/internal-linking": "technical",
  "/tools/link-recommender": "technical",
  "/tools/link-graph": "technical",
  "/tools/pagerank": "technical",
  "/tools/traffic-drop": "technical",

  // Generators
  "/tools/pixel-preview": "generators",
  "/tools/social-preview": "generators",
  "/tools/og-image": "generators",
  "/tools/image-gen": "generators",
  "/tools/bulk-alt": "generators",
  "/tools/programmatic-seo": "generators",

  // Indexing / redirects / migration
  "/tools/hreflang": "migration",
  "/tools/hreflang-gen": "migration",
  "/tools/migration-map": "migration",
  "/tools/migration-parity": "migration",
  "/tools/redirects-bulk": "migration",
  "/tools/redirects-manager": "migration",
  "/tools/robots": "migration",
  "/tools/robots-history": "migration",
  "/tools/sitemap": "migration",
  "/tools/indexnow": "migration",
  "/tools/gsc-coverage": "migration",

  // Specialty / experimental
  "/tools/bing": "specialty",
  "/tools/github-pr": "specialty",
  "/tools/browser-agent": "specialty",
  "/tools/screenshot-import": "specialty",
  "/tools/utm-attribution": "specialty",
};

/** Resolve a tool href to its category. Falls back to "specialty" for
 * anything not explicitly listed (newly-added tools without a category yet). */
export function categoryOf(href: string): ToolCategoryId {
  return EXPLICIT[href] ?? "specialty";
}
