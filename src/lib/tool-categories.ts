/**
 * How the tools are grouped on /tools.
 *
 * The previous taxonomy had eleven categories named after what a tool
 * IS — "technical", "generators", "migration". Measured, the
 * distribution was badly lopsided: 23 tools in "technical" (a dumping
 * ground), 11 in "migration" (used a few times a year), and exactly 1
 * in "local", which is not a category. Everything rendered at equal
 * visual weight, so 99 tools competed with each other and the six
 * genuinely-everyday ones won nothing.
 *
 * These categories are named after WHY someone opened the app. A
 * freelancer doesn't think "I need a technical tool" — they think "a
 * prospect asked why their traffic dropped". Five jobs cover almost
 * every real session:
 *
 *   win        pitching, proving value, first look at a site
 *   fix        something is broken and needs finding
 *   improve    a specific page needs to be better
 *   track      measuring, and turning that into something to send
 *   ai         getting cited by AI search
 *
 * Everything genuinely occasional — migrations, one-off generators,
 * niche specialties — goes to `occasional`, which the UI collapses.
 * Those tools aren't worse; they're just not what today is about, and
 * listing them beside the daily ones makes the daily ones harder to
 * find.
 */

export type ToolCategoryId =
  | "win"
  | "fix"
  | "improve"
  | "track"
  | "ai"
  | "occasional";

export const CATEGORY_LABELS: Record<
  ToolCategoryId,
  { label: string; description: string }
> = {
  win: {
    label: "Win the work",
    description:
      "Size up a site fast, and prove there's a problem worth paying to fix.",
  },
  fix: {
    label: "Find what's broken",
    description:
      "Diagnostics. Something's wrong and you need to know what, and where.",
  },
  improve: {
    label: "Improve a page",
    description: "Make one page better — content, meta, schema, links.",
  },
  track: {
    label: "Track & report",
    description: "Measure what's happening and turn it into something to send.",
  },
  ai: {
    label: "Get found by AI",
    description:
      "Being cited in ChatGPT, Perplexity and AI Overviews — and controlling which bots read you.",
  },
  occasional: {
    label: "Occasional",
    description:
      "Migrations, generators and specialist jobs. Useful when you need them, noise when you don't.",
  },
};

/**
 * Tools deliberately not shown in the grid.
 *
 * "Retired" means removed from the listing, NOT deleted — every route
 * still works. Bookmarks, links inside old reports, and anything a user
 * saved keep functioning; the tool just stops competing for attention
 * with the one that replaced it.
 *
 * Each entry names what to use instead, so the decision is auditable
 * and reversible by deleting one line.
 */
export const RETIRED: Record<string, { useInstead: string; why: string }> = {
  "/tools/content-attack-brief": {
    useInstead: "/tools/attack-briefs",
    why: "Near-identical to Content Attack Briefs — same libraries, 33 lines against 194. Two entries for one job.",
  },
  "/tools/crux-origin": {
    useInstead: "/tools/crux",
    why: "Origin-versus-URL is a toggle inside a Core Web Vitals check, not a separate tool.",
  },
  "/tools/hreflang-gen": {
    useInstead: "/tools/hreflang",
    why: "Generating and validating hreflang is one task. Splitting them made users choose before they knew which they needed.",
  },
  "/tools/redirects-bulk": {
    useInstead: "/tools/redirects-manager",
    why: "The redirect manager already tests chains in bulk.",
  },
  "/tools/robots-history": {
    useInstead: "/tools/robots",
    why: "History belongs inside the robots.txt tool, next to the current file.",
  },
  "/tools/schema-validate": {
    useInstead: "/tools/schema",
    why: "Validating is what you do immediately after generating. One tool, two steps.",
  },
  "/tools/link-recommender": {
    useInstead: "/tools/internal-linking",
    why: "Overlapped internal linking and the auto-link suggester — three tools proposing internal links.",
  },
  "/tools/pixel-preview": {
    useInstead: "/tools/social-preview",
    why: "Social preview already renders how a link appears when shared.",
  },
};

export function isRetired(href: string): boolean {
  return href in RETIRED;
}

/**
 * Every tool's category.
 *
 * Anything unlisted falls to `occasional` rather than a "specialty"
 * bucket — the honest default for an unclassified tool is "not part of
 * the daily loop", not "special".
 */
const EXPLICIT: Record<string, ToolCategoryId> = {
  // Not one of our routes — content writing moved to BlogPilot, and the
  // card that says so needs to sit where the writing tools used to be
  // rather than falling through to "occasional", which is collapsed by
  // default and is where a signpost is least likely to be read.
  "https://github.com/IamRamgarhia/BlogPilot-Open-Source-AI-SEO-Content-Studio":
    "improve",
  // --- Win the work -------------------------------------------------
  "/tools/health-check": "win",
  "/tools/domain-overview": "win",
  "/tools/rank-where": "win",
  "/tools/bulk-scan": "win",
  "/tools/geo-score": "win",
  "/tools/traffic-drop": "win",

  // --- Find what's broken -------------------------------------------
  "/tools/link-checker": "fix",
  "/tools/redirects-manager": "fix",
  "/tools/soft-404": "fix",
  "/tools/canonical-audit": "fix",
  "/tools/headers": "fix",
  "/tools/security": "fix",
  "/tools/mobile-friendly": "fix",
  "/tools/render": "fix",
  "/tools/crux": "fix",
  "/tools/perf-budget": "fix",
  "/tools/uptime": "fix",
  "/tools/wp-hack-scan": "fix",
  "/tools/facet-trap": "fix",
  "/tools/robots": "fix",
  "/tools/sitemap": "fix",

  // --- Improve a page -----------------------------------------------
  "/tools/content-grader": "improve",
  "/tools/content-score": "improve",
  "/tools/brief": "improve",
  "/tools/meta-tag-generator": "improve",
  "/tools/schema": "improve",
  "/tools/internal-linking": "improve",
  "/tools/auto-link": "improve",
  "/tools/bulk-alt": "improve",
  "/tools/refresh": "improve",
  "/tools/summarizer": "improve",
  "/tools/plagiarism": "improve",
  "/tools/eeat-audit": "improve",
  "/tools/sxo": "improve",
  "/tools/social-preview": "improve",

  // --- Track & report -----------------------------------------------
  "/tools/search-volume": "track",
  "/tools/cannibalization": "track",
  "/tools/cluster": "track",
  "/tools/intent-classifier": "track",
  "/tools/keyword-difficulty": "track",
  "/tools/serp-features": "track",
  "/tools/serp-volatility": "track",
  "/tools/branded-split": "track",
  "/tools/gsc-coverage": "track",
  "/tools/indexnow": "track",
  "/tools/backlink-discovery": "track",
  "/tools/anchor-distribution": "track",

  // --- Get found by AI ----------------------------------------------
  "/tools/ai-overview": "ai",
  "/tools/ai-citation-tactics": "ai",
  "/tools/aio-passage": "ai",
  "/tools/llms-txt": "ai",
  "/tools/ai-robots": "ai",
  "/tools/ai-slop": "ai",
  "/tools/ai-schema": "ai",
  "/tools/reddit-research": "ai",
  "/tools/reputation-abuse-risk": "ai",
  "/tools/expert-panel": "ai",

  // --- Occasional ---------------------------------------------------
  // Genuinely useful, genuinely not daily. Collapsed by default.
  "/tools/migration-map": "occasional",
  "/tools/migration-parity": "occasional",
  "/tools/hreflang": "occasional",
  "/tools/programmatic-seo": "occasional",
  "/tools/og-image": "occasional",
  "/tools/image-gen": "occasional",
  "/tools/code-generator": "occasional",
  "/tools/github-pr": "occasional",
  "/tools/browser-agent": "occasional",
  "/tools/utm-attribution": "occasional",
  "/tools/bing": "occasional",
  "/tools/screenshot-import": "occasional",
  "/tools/disavow": "occasional",
  "/tools/outreach-personalize": "occasional",
  "/tools/youtube": "occasional",
  "/tools/youtube-audit": "occasional",
  "/tools/news-headline": "occasional",
  "/tools/person-schema": "occasional",
  "/tools/gbp-reply": "occasional",
  "/tools/dns-whois": "occasional",
  "/tools/wayback": "occasional",
  "/tools/link-graph": "occasional",
  "/tools/pagerank": "occasional",
  "/tools/local-cwv": "occasional",
  "/tools/attack-briefs": "occasional",
  "/tools/content-helpers": "occasional",
  "/tools/trending": "occasional",
  "/tools/ads-funnel": "occasional",
  "/tools/external": "occasional",
};

export function categoryOf(href: string): ToolCategoryId {
  return EXPLICIT[href] ?? "occasional";
}

/** Render order. The five jobs first, occasional last and collapsed. */
export const CATEGORY_ORDER: ToolCategoryId[] = [
  "win",
  "fix",
  "improve",
  "track",
  "ai",
  "occasional",
];

/** Collapsed by default in the UI. */
export const COLLAPSED_BY_DEFAULT: ToolCategoryId[] = ["occasional"];
