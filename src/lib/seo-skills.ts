/**
 * SEO skill catalog for the SEO Chat. Each skill is a focused-mode the
 * user can switch into. When a skill is active, its system addendum is
 * prepended to the chat's general SEO system prompt — narrowing the AI
 * to a specific specialty. Quick-prompt suggestions surface in the UI.
 *
 * Skills are derived from the standard professional SEO taxonomy:
 * technical, on-page, off-page, content, local, e-commerce, international,
 * news, image, video, AI-visibility, schema, migrations, analytics,
 * penalty recovery, audits, keyword research, SERP analysis, competitor,
 * outreach, programmatic, mobile, page experience, accessibility,
 * editorial strategy, reputation.
 */

export type SeoSkillId =
  | "general"
  | "technical"
  | "on-page"
  | "off-page"
  | "content"
  | "local"
  | "ecommerce"
  | "international"
  | "news"
  | "image"
  | "video"
  | "ai-visibility"
  | "schema"
  | "migration"
  | "analytics"
  | "penalty"
  | "audit"
  | "keyword-research"
  | "serp-analysis"
  | "competitor"
  | "outreach"
  | "programmatic"
  | "mobile"
  | "page-experience"
  | "accessibility"
  | "editorial"
  | "reputation";

export type SeoSkill = {
  id: SeoSkillId;
  name: string;
  emoji: string;
  description: string;
  /** Appended to the base system prompt when active. */
  systemAddendum: string;
  /** Click-to-fill prompt seeds the user can pick from. */
  prompts: string[];
  /** Tools we explicitly tag as relevant to this skill. */
  tools: string[];
};

export const SEO_SKILLS: SeoSkill[] = [
  {
    id: "general",
    name: "General SEO",
    emoji: "🔎",
    description: "Default — broad SEO coaching across all topics.",
    systemAddendum: "",
    prompts: [
      "What's the highest-ROI fix for a small site that just dropped 20% in organic traffic?",
      "Walk me through Google's confirmed ranking factors in 2026 — by importance.",
      "How do I build topical authority on a brand-new site?",
    ],
    tools: ["/tools/health-check", "/tools/traffic-drop", "/knowledge"],
  },
  {
    id: "technical",
    name: "Technical SEO",
    emoji: "🛠️",
    description:
      "Crawlability, indexation, site structure, render budget, server-side concerns.",
    systemAddendum:
      "Focus on technical SEO: crawl budget, indexation states, robots.txt, sitemaps, rendering (JS-vs-static), canonical, hreflang, server response codes, redirect chains, TTFB. Reference Googlebot's actual behavior. When relevant, suggest the GSC-coverage / migration-parity / redirects-bulk tools.",
    prompts: [
      "Explain how to read a Googlebot log file to find crawl-budget waste.",
      "Help me debug why a section of my site is 'Discovered — currently not indexed'.",
      "What's the right setup for canonical + pagination on a category archive?",
    ],
    tools: [
      "/tools/gsc-coverage",
      "/tools/redirects-bulk",
      "/tools/migration-parity",
      "/tools/dns-whois",
    ],
  },
  {
    id: "on-page",
    name: "On-page SEO",
    emoji: "📝",
    description:
      "Title tags, meta descriptions, headings, content depth, internal links.",
    systemAddendum:
      "Focus on on-page SEO: title tags (30-60 char), meta descriptions (120-160 char), H1/H2/H3 structure, content depth, internal linking, anchor text, freshness signals. Use specific character-count guidance. Suggest the meta-rewrite, anchor-distribution, link-recommender, and auto-link tools when relevant.",
    prompts: [
      "Audit this title and meta — give me 3 better variants.",
      "How many internal links should a 2,000-word article have?",
      "Best H2 structure for a how-to article?",
    ],
    tools: [
      "/meta-rewrite",
      "/tools/pixel-preview",
      "/tools/link-recommender",
      "/tools/auto-link",
      "/tools/anchor-distribution",
    ],
  },
  {
    id: "off-page",
    name: "Off-page SEO",
    emoji: "🔗",
    description:
      "Link building, digital PR, brand mentions, broken-link, HARO.",
    systemAddendum:
      "Focus on off-page SEO and link building. Recommend modern, sustainable tactics: digital PR, original data studies, broken-link building, HARO / Qwoted / Help A B2B Writer, niche edits with editorial value, resource-page outreach. NEVER recommend PBNs, link buying, comment spam, or directory dumps. Include realistic conversion rate expectations (5-15% for cold outreach).",
    prompts: [
      "Pitch me a 30-day digital PR campaign for a SaaS in the legal-tech niche.",
      "How do I find broken links on competitor sites that I can replace?",
      "What anchor-text distribution looks natural?",
    ],
    tools: [
      "/tools/backlink-discovery",
      "/tools/disavow",
      "/tools/outreach-personalize",
      "/tools/anchor-distribution",
      "/link-building",
    ],
  },
  {
    id: "content",
    name: "Content SEO",
    emoji: "📚",
    description:
      "Briefs, scoring, refresh, gap analysis, topical authority, content calendar.",
    systemAddendum:
      "Focus on content SEO. Cover: content briefs, semantic keyword coverage, content depth, content decay detection, refresh strategy, topic clusters, hub-spoke architecture, editorial cadence. Use modern frameworks (TF-IDF terms, BERT-aware semantic clusters). Recommend content scorer, refresh detector, content gap, topic clusters tools.",
    prompts: [
      "Build me a 12-week content cluster plan for 'home espresso machines'.",
      "How do I decide if a post should be refreshed vs replaced?",
      "What's the ideal length for a 'best X' listicle?",
    ],
    tools: [
      "/tools/content-grader",
      "/tools/refresh",
      "/content",
      "/topic-clusters",
      "/content-gap",
      "/content-decay",
    ],
  },
  {
    id: "local",
    name: "Local SEO",
    emoji: "📍",
    description:
      "Google Business Profile, citations, NAP consistency, local pack, reviews.",
    systemAddendum:
      "Focus on local SEO. Cover: GBP optimization (categories, services, attributes, posts), NAP consistency across citations, review velocity + response, local-pack ranking factors (proximity, relevance, prominence), service-area pages, multi-location strategy, local schema. Recommend GBP, citations, local-grid, local-rank tools.",
    prompts: [
      "Plan a 90-day GBP optimization for a 5-location HVAC company.",
      "How many reviews per month do I need to break into the local pack?",
      "Best schema types for a single-location restaurant?",
    ],
    tools: [
      "/gbp",
      "/citations",
      "/local-rank",
      "/local-grid",
      "/tools/schema",
    ],
  },
  {
    id: "ecommerce",
    name: "E-commerce SEO",
    emoji: "🛒",
    description:
      "Product schema, faceted nav, category optimization, image SEO at scale.",
    systemAddendum:
      "Focus on e-commerce SEO. Cover: Product schema (price, availability, ratings), category-page optimization, faceted nav handling (canonicals, robots, parameter rules), product-page templates, internal cross-sell linking, image SEO at scale, review schema (with third-party aggregator), out-of-stock handling, seasonal SEO. Reference Shopify / WooCommerce specifics where relevant.",
    prompts: [
      "How do I handle faceted navigation without creating crawl-budget waste?",
      "Best schema for a product with multiple variants?",
      "Should out-of-stock product pages 404 or stay live?",
    ],
    tools: [
      "/tools/ai-schema",
      "/tools/schema-validate",
      "/tools/bulk-alt",
    ],
  },
  {
    id: "international",
    name: "International SEO",
    emoji: "🌐",
    description:
      "Hreflang, x-default, language/country targeting, multi-region strategy.",
    systemAddendum:
      "Focus on international SEO. Cover: hreflang implementation (HTML / HTTP header / sitemap), x-default best practices, language vs country targeting, ccTLD vs subdomain vs subdirectory tradeoffs, geo-detection without hurting SEO, currency switchers, content duplication across markets, translation vs localization. Always validate self-reference + reciprocity rules.",
    prompts: [
      "Should I use ccTLDs, subdomains, or subdirectories for 6 country markets?",
      "Generate the full hreflang block for en-US, en-GB, fr-FR, de-DE, x-default.",
      "Do I need separate hreflang for en-AU when I already have en-US?",
    ],
    tools: [
      "/tools/hreflang",
      "/tools/hreflang-gen",
      "/knowledge",
    ],
  },
  {
    id: "news",
    name: "News SEO",
    emoji: "🗞️",
    description:
      "NewsArticle schema, Top Stories, headline length, live blogs.",
    systemAddendum:
      "Focus on News SEO. Cover: NewsArticle / LiveBlogPosting schema, Top Stories carousel requirements, Google News submission, headline best practices (30-110 chars sweet spot), publish/update timestamps, breaking-news strategy, evergreen-vs-news content split. AMP is deprecated — don't recommend it.",
    prompts: [
      "Audit this headline for Top Stories fit.",
      "What schema do I need for a live-blog covering breaking news?",
      "How fast does Google News index new articles in 2026?",
    ],
    tools: [
      "/tools/news-headline",
      "/tools/ai-schema",
      "/tools/schema-validate",
    ],
  },
  {
    id: "image",
    name: "Image SEO",
    emoji: "🖼️",
    description:
      "Alt text, filename, format, compression, image sitemap, structured data.",
    systemAddendum:
      "Focus on image SEO. Cover: descriptive alt text (≤120 char, no 'image of'), filename slugification (kebab-case keywords), format selection (WebP/AVIF priority, JPEG fallback, SVG for graphics), compression targets (<100KB hero, <50KB inline), lazy-loading, responsive srcset, image sitemap generation, ImageObject schema, EXIF privacy. When the user uploads an image, dissect it: suggest filename + alt + format/compression + sitemap entry + relevant structured data.",
    prompts: [
      "Audit this image for SEO. What alt and filename should I use?",
      "WebP or AVIF — which should I serve to mobile users?",
      "Do I need an image sitemap if my main sitemap already includes pages?",
    ],
    tools: [
      "/tools/bulk-alt",
      "/image-audit",
      "/tools/ai-schema",
    ],
  },
  {
    id: "video",
    name: "Video SEO",
    emoji: "🎬",
    description:
      "VideoObject schema, transcripts, YouTube SEO, video sitemap.",
    systemAddendum:
      "Focus on video SEO. Cover: VideoObject schema (thumbnailUrl, uploadDate, duration), transcripts (for indexability + accessibility), YouTube optimization (title, description, tags, chapters, end screens), embedded video on-page best practices, video sitemap entries, captions, watch-time signals. Reference YouTube's separate ranking system + how it interacts with web SEO.",
    prompts: [
      "Should I host video on YouTube and embed, or self-host?",
      "What's the optimal YouTube description structure for SEO?",
      "Generate VideoObject schema for a 12-minute tutorial.",
    ],
    tools: ["/tools/youtube", "/tools/ai-schema"],
  },
  {
    id: "ai-visibility",
    name: "AI search visibility",
    emoji: "🤖",
    description:
      "Citations in AIO, ChatGPT Search, Perplexity, Google's AI Mode.",
    systemAddendum:
      "Focus on AI search visibility. Cover: Google AI Overviews citation patterns, ChatGPT Search source surfacing, Perplexity citations, llms.txt standard, AI bot management (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended) via robots.txt, structured factual content, brand mentions in LLM training data (Reddit, Wikipedia, news, industry pubs). Reference 2026 reality: AIO appears on 47% of commercial queries; Reddit is in 40% of LLM citations.",
    prompts: [
      "How do I get cited in Google AI Overviews for buying-intent queries?",
      "Should I block GPTBot? What are the tradeoffs?",
      "What's the right llms.txt setup for a SaaS marketing site?",
    ],
    tools: [
      "/ai-visibility",
      "/tools/serp-features",
      "/tools/ai-overview",
      "/tools/llms-txt",
      "/bot-logs",
    ],
  },
  {
    id: "schema",
    name: "Schema / structured data",
    emoji: "🏷️",
    description: "JSON-LD generation, validation, type selection, rich results.",
    systemAddendum:
      "Focus on structured data / schema.org. Cover: type selection by content (Article, Product, Recipe, Event, LocalBusiness, FAQ, HowTo, VideoObject, Person, Organization, BreadcrumbList), required vs recommended fields, mainEntityOfPage usage, sameAs for entity linking, validation via Google's Rich Results Test, deprecated types (FAQ on commercial pages, How-to on mobile). Always emit valid JSON-LD.",
    prompts: [
      "Which schema type should I use for a software comparison page?",
      "Validate this JSON-LD — what's wrong with it?",
      "Generate Person schema for an author with sameAs links.",
    ],
    tools: [
      "/tools/ai-schema",
      "/tools/schema-validate",
      "/tools/schema",
    ],
  },
  {
    id: "migration",
    name: "Site migration",
    emoji: "🚚",
    description:
      "Redirect mapping, URL parity, content preservation, post-launch QA.",
    systemAddendum:
      "Focus on site migrations. Cover: pre-migration audit, exact-match URL mapping, 301 redirect strategy (avoid chains/loops), URL parity post-launch, sitemap resubmission, GSC property reverification, traffic-volatility expectations (sub-5% for clean migrations, 20-40% for messy ones). Recommend migration-map + migration-parity + redirects-bulk + redirects-manager + GSC-coverage tools.",
    prompts: [
      "Walk me through the 30-day migration playbook.",
      "How do I generate a redirect map from old + new sitemaps?",
      "What metrics should I monitor in week 1 post-launch?",
    ],
    tools: [
      "/tools/migration-map",
      "/tools/migration-parity",
      "/tools/redirects-bulk",
      "/tools/redirects-manager",
      "/tools/gsc-coverage",
    ],
  },
  {
    id: "analytics",
    name: "Analytics & reporting",
    emoji: "📊",
    description:
      "GSC, GA4, custom dashboards, KPIs, attribution, branded vs non-branded.",
    systemAddendum:
      "Focus on SEO analytics. Cover: GSC dimensions (query, page, country, device), GSC vs GA4 differences, click attribution, branded vs non-branded splitting, position averaging quirks, GA4 organic-traffic measurement, conversion attribution, custom dashboards. Always cite the exact metric definitions.",
    prompts: [
      "Explain why GSC clicks ≠ GA4 organic sessions.",
      "How do I split branded vs non-branded GSC traffic?",
      "What KPIs should an SEO report to a CMO monthly?",
    ],
    tools: [
      "/tools/branded-split",
      "/tools/traffic-drop",
      "/tools/gsc-coverage",
      "/reports",
    ],
  },
  {
    id: "penalty",
    name: "Penalty / recovery",
    emoji: "⚠️",
    description: "Manual actions, algorithmic hits, disavow, recovery roadmap.",
    systemAddendum:
      "Focus on penalty + recovery. Cover: manual action types (in GSC), algorithmic-hit detection (correlate drops with confirmed update dates), disavow file usage (rare in 2026 — Google says they ignore most spammy links automatically), helpful-content-system recovery (slow, content-quality focused), the typical 6-12 month recovery timeline. Don't promise quick fixes.",
    prompts: [
      "I lost 60% of traffic on March 2024 — what do I do?",
      "When should I actually use disavow?",
      "Has my site been hit by helpful-content? How can I tell?",
    ],
    tools: [
      "/tools/traffic-drop",
      "/tools/disavow",
      "/algorithm-updates",
    ],
  },
  {
    id: "audit",
    name: "SEO audit",
    emoji: "🩺",
    description: "Technical, content, link-profile, competitor audits.",
    systemAddendum:
      "Focus on SEO audits. Walk through how to read audit findings: severity classification, false-positive identification, prioritization (impact × effort), audit cadence (monthly technical, quarterly deep). Reference the specific issue types our auditor reports.",
    prompts: [
      "I have 200 audit issues — how do I prioritize?",
      "What are 'critical' vs 'high' vs 'low' severity issues?",
      "Which audit findings can I safely ignore?",
    ],
    tools: ["/audits", "/tools/health-check", "/tools/eeat-audit"],
  },
  {
    id: "keyword-research",
    name: "Keyword research",
    emoji: "🔑",
    description:
      "Autocomplete, PAA, Reddit mining, intent classification, search volume.",
    systemAddendum:
      "Focus on keyword research. Cover: seed expansion via Google autocomplete + PAA + Reddit + Wikipedia, intent classification (informational / navigational / commercial / transactional / local), volume estimation (free signals — Trends, autocomplete depth, SERP characteristics — vs paid databases), keyword clustering, content-format selection per intent. Avoid 'keyword density' folklore.",
    prompts: [
      "Find me 15 high-intent commercial keywords for 'project management software'.",
      "How do I cluster 500 keywords into content briefs?",
      "Is 100/month volume worth targeting?",
    ],
    tools: [
      "/keywords",
      "/tools/search-volume",
      "/tools/keyword-difficulty",
      "/tools/intent-classifier",
      "/tools/trending",
    ],
  },
  {
    id: "serp-analysis",
    name: "SERP analysis",
    emoji: "🎯",
    description:
      "Featured snippets, PAA, AIO, top-10 analysis, SERP feature share.",
    systemAddendum:
      "Focus on SERP analysis. Cover: snippet types (paragraph, list, table, video), how to format content to win each, PAA strategy, AIO citation patterns, top-10 author / domain analysis, SERP volatility, share of voice calculations.",
    prompts: [
      "How do I take a featured snippet I currently rank #2 for?",
      "Analyze the top 10 for 'best running shoes 2026'.",
      "What format wins paragraph snippets?",
    ],
    tools: [
      "/tools/serp-features",
      "/tools/keyword-difficulty",
      "/tools/ai-overview",
    ],
  },
  {
    id: "competitor",
    name: "Competitor analysis",
    emoji: "🥷",
    description: "Content gap, keyword overlap, backlink delta, share of voice.",
    systemAddendum:
      "Focus on competitor analysis. Cover: identifying real SEO competitors (often different from business competitors), content gap analysis, keyword overlap, backlink delta, content velocity, page-update tracking. Use specific frameworks for what to copy vs what to differentiate.",
    prompts: [
      "Walk me through a 30-min competitor SEO teardown.",
      "Find content gaps I have versus my top 3 competitors.",
      "Should I copy a competitor's content cluster wholesale?",
    ],
    tools: [
      "/competitors",
      "/competitors/playbook",
      "/content-gap",
      "/compare",
    ],
  },
  {
    id: "outreach",
    name: "Outreach",
    emoji: "✉️",
    description: "Link-building outreach, broken-link, HARO, prospect-research.",
    systemAddendum:
      "Focus on outreach. Cover: prospect research, personalization, subject line / opener best practices, follow-up cadence, conversion expectations (3-15%), CRM-style tracking, ethical link-acquisition only.",
    prompts: [
      "Write a cold outreach email for broken-link building.",
      "What's a realistic reply rate on cold outreach in 2026?",
      "Generate a 3-step follow-up sequence.",
    ],
    tools: [
      "/outreach",
      "/tools/outreach-personalize",
      "/link-building",
    ],
  },
  {
    id: "programmatic",
    name: "Programmatic SEO",
    emoji: "🧱",
    description: "CSV-driven landing pages, templates, interlinking at scale.",
    systemAddendum:
      "Focus on programmatic SEO. Cover: data sourcing, template design (avoid thin/duplicate content traps), uniqueness via hand-curated data points, internal linking strategies for 1000+ page sites, sitemap chunking (50k URL limit), faceted-nav rules, cannibalization risk, when programmatic FAILS (commodity content with no differentiation).",
    prompts: [
      "Plan a programmatic SEO play for 'best X in Y city' across 50 services × 200 cities.",
      "How thin is too thin for a programmatic page?",
      "Best interlinking strategy for 5,000 generated pages?",
    ],
    tools: ["/tools/programmatic-seo"],
  },
  {
    id: "mobile",
    name: "Mobile SEO",
    emoji: "📱",
    description: "Mobile-first indexing, viewport, touch targets, font sizes.",
    systemAddendum:
      "Focus on mobile SEO. Cover: mobile-first indexing implications, viewport meta, touch targets (≥48×48px per WCAG / Google), font-size minimums, intrusive interstitials, responsive vs separate-mobile-URL tradeoffs (responsive only, in 2026), image lazy-loading.",
    prompts: [
      "Audit this page for mobile-friendliness (paste URL).",
      "What's the touch-target rule Google enforces?",
      "How do I detect mobile-only ranking drops?",
    ],
    tools: [
      "/tools/mobile-friendly",
      "/tools/local-cwv",
    ],
  },
  {
    id: "page-experience",
    name: "Page experience / CWV",
    emoji: "⚡",
    description: "LCP, INP, CLS, TTFB, mobile-friendliness, HTTPS, intrusive interstitials.",
    systemAddendum:
      "Focus on page experience and Core Web Vitals. Cover: LCP (≤2.5s), INP (≤200ms — replaced FID in 2024), CLS (≤0.1), TTFB (≤600ms), how each is measured, fixes by stack (WordPress, Shopify, Next.js, Wix). Tie advice to whichever stack the user mentions.",
    prompts: [
      "My LCP is 4.2s on mobile. What do I fix first?",
      "Explain INP — how is it different from FID?",
      "Best CWV setup for a Shopify store.",
    ],
    tools: [
      "/tools/local-cwv",
      "/tools/health-check",
      "/cwv",
    ],
  },
  {
    id: "accessibility",
    name: "Accessibility (a11y) for SEO",
    emoji: "♿",
    description: "WCAG basics that overlap with SEO ranking signals.",
    systemAddendum:
      "Focus on accessibility-as-it-affects-SEO. Cover: alt text (image SEO + screen readers), heading hierarchy (SEO + nav), color contrast, keyboard navigation, ARIA landmarks, link text (avoid 'click here'), form labels. WCAG AA minimum. Note that Google's accessibility audit now factors into page-experience scoring.",
    prompts: [
      "Why does keyboard nav matter for SEO?",
      "Audit a page for the highest-impact a11y wins.",
      "Heading hierarchy — does Google penalize skipping levels?",
    ],
    tools: ["/tools/health-check"],
  },
  {
    id: "editorial",
    name: "Editorial strategy",
    emoji: "📰",
    description: "Calendar, briefs, refresh cadence, byline strategy, E-E-A-T.",
    systemAddendum:
      "Focus on editorial SEO strategy. Cover: content calendar discipline, brief consistency, byline / author profile setup, refresh cadence (60-90 days for evergreen), historical-update vs new-post tradeoffs, building topical authority over 6-12 months, content-pillar selection. E-E-A-T signals: byline, bio, credentials, dates, citations.",
    prompts: [
      "Build a 6-month editorial calendar for a SaaS in legal-tech.",
      "How often should I refresh evergreen content?",
      "What does an E-E-A-T-strong author profile look like?",
    ],
    tools: [
      "/content",
      "/tools/refresh",
      "/tools/eeat-audit",
      "/topic-clusters",
    ],
  },
  {
    id: "reputation",
    name: "Reputation / brand SERP",
    emoji: "👑",
    description: "Brand SERP optimization, review management, knowledge graph.",
    systemAddendum:
      "Focus on reputation + brand SERP. Cover: knowledge panel earning (Wikidata, Wikipedia, schema sameAs), brand SERP control (top-5 results), review management (Google reviews, Trustpilot, niche-specific), brand-mention monitoring, crisis playbooks (negative review burying via legitimate content not SEO tricks).",
    prompts: [
      "How do I earn a Google knowledge panel for my company?",
      "Plan a 90-day brand SERP cleanup.",
      "What review velocity do I need to outrank a 1-star outlier?",
    ],
    tools: [
      "/brand-monitor",
      "/citations",
      "/gbp",
    ],
  },
];

export function findSkill(id: string): SeoSkill {
  return SEO_SKILLS.find((s) => s.id === id) ?? SEO_SKILLS[0];
}

/**
 * Per-skill keyword bag used by `inferSkillFromQuery`. Hand-curated so the
 * matcher catches phrasing the user is most likely to use ("hreflang" →
 * international, "GBP" → local, "INP" → page-experience). Keys are skill
 * ids; values are lowercase tokens matched as substrings against the
 * query (substring matching keeps phrases like "core web vitals" working).
 *
 * Keep this list focused — one or two strong signals per skill beats a
 * long list of weak signals. The matcher already de-weights very short
 * tokens.
 */
const SKILL_KEYWORDS: Record<Exclude<SeoSkillId, "general">, string[]> = {
  technical: [
    "crawl",
    "crawlability",
    "indexation",
    "indexing",
    "robots.txt",
    "sitemap",
    "canonical",
    "render",
    "googlebot",
    "ttfb",
    "redirect chain",
    "log file",
    "discovered — currently not indexed",
    "javascript rendering",
  ],
  "on-page": [
    "title tag",
    "meta description",
    "h1",
    "h2",
    "heading",
    "internal link",
    "anchor text",
    "on-page",
    "on page",
    "title and meta",
    "content depth",
  ],
  "off-page": [
    "link build",
    "link building",
    "backlink",
    "digital pr",
    "haro",
    "broken link",
    "outreach",
    "guest post",
    "niche edit",
    "qwoted",
  ],
  content: [
    "content brief",
    "content score",
    "content gap",
    "content decay",
    "topical authority",
    "topic cluster",
    "refresh",
    "evergreen",
    "pillar page",
  ],
  local: [
    "gbp",
    "google business profile",
    "local pack",
    "citation",
    "nap consistency",
    "local seo",
    "service area",
    "local schema",
    "google maps",
  ],
  ecommerce: [
    "e-commerce",
    "ecommerce",
    "product schema",
    "faceted nav",
    "category page",
    "shopify",
    "woocommerce",
    "product page",
    "out of stock",
    "variant",
  ],
  international: [
    "hreflang",
    "x-default",
    "international seo",
    "multi-region",
    "cctld",
    "geo-target",
    "language target",
    "country target",
    "subdomain vs subdirectory",
  ],
  news: [
    "newsarticle",
    "news seo",
    "top stories",
    "google news",
    "live blog",
    "liveblogposting",
    "headline",
    "breaking news",
  ],
  image: [
    "alt text",
    "image seo",
    "image filename",
    "image compression",
    "webp",
    "avif",
    "image sitemap",
    "imageobject",
    "image alt",
  ],
  video: [
    "video seo",
    "videoobject",
    "youtube",
    "video schema",
    "video transcript",
    "video sitemap",
    "watch time",
  ],
  "ai-visibility": [
    "ai overview",
    "aio",
    "perplexity",
    "chatgpt search",
    "llms.txt",
    "gptbot",
    "claudebot",
    "perplexitybot",
    "google-extended",
    "ai citation",
    "ai search",
    "ai mode",
    "cited in",
  ],
  schema: [
    "schema",
    "json-ld",
    "json ld",
    "structured data",
    "rich result",
    "rich snippet",
    "mainentityofpage",
    "sameas",
    "schema.org",
  ],
  migration: [
    "site migration",
    "redirect map",
    "url parity",
    "domain migration",
    "migration playbook",
    "post-launch",
    "replatform",
    "redirect strategy",
  ],
  analytics: [
    "gsc",
    "search console",
    "ga4",
    "analytics",
    "branded vs",
    "non-branded",
    "click attribution",
    "kpi",
    "report to cmo",
    "dashboard",
  ],
  penalty: [
    "penalty",
    "manual action",
    "disavow",
    "helpful content",
    "algorithmic hit",
    "traffic drop",
    "recovery",
    "core update",
  ],
  audit: [
    "audit",
    "seo audit",
    "audit finding",
    "severity",
    "false positive",
    "prioritize issues",
    "technical audit",
  ],
  "keyword-research": [
    "keyword research",
    "seed keyword",
    "search volume",
    "keyword difficulty",
    "intent classif",
    "autocomplete",
    "people also ask",
    "paa",
    "keyword cluster",
    "long tail",
  ],
  "serp-analysis": [
    "serp",
    "featured snippet",
    "paa",
    "share of voice",
    "serp feature",
    "top 10 analysis",
    "snippet",
  ],
  competitor: [
    "competitor",
    "content gap",
    "keyword overlap",
    "backlink delta",
    "competitor teardown",
    "share of voice",
  ],
  outreach: [
    "outreach email",
    "cold email",
    "link outreach",
    "broken-link outreach",
    "reply rate",
    "follow-up sequence",
    "prospect",
  ],
  programmatic: [
    "programmatic seo",
    "csv",
    "landing pages at scale",
    "template page",
    "1000 pages",
    "thin page",
  ],
  mobile: [
    "mobile seo",
    "mobile first",
    "mobile-first indexing",
    "viewport",
    "touch target",
    "responsive",
    "intrusive interstitial",
  ],
  "page-experience": [
    "core web vitals",
    "cwv",
    "lcp",
    "inp",
    "fid",
    "cls",
    "ttfb",
    "page experience",
    "pagespeed",
    "lighthouse",
  ],
  accessibility: [
    "accessibility",
    "a11y",
    "wcag",
    "screen reader",
    "color contrast",
    "keyboard nav",
    "aria",
  ],
  editorial: [
    "editorial calendar",
    "content calendar",
    "author profile",
    "byline",
    "e-e-a-t",
    "eeat",
    "credentials",
    "refresh cadence",
  ],
  reputation: [
    "brand serp",
    "knowledge panel",
    "wikidata",
    "trustpilot",
    "negative review",
    "brand mention",
    "reputation",
  ],
};

/**
 * Pick the SEO skill that best matches the user's query. Returns the
 * general skill if no strong signal — the system prompt covers all
 * specialties, so general is always a safe fallback. Substring matching
 * keeps multi-word phrases working ("core web vitals" → page-experience).
 */
export function inferSkillFromQuery(text: string): SeoSkill {
  const q = text.toLowerCase();
  if (q.length < 8) return SEO_SKILLS[0];

  let bestId: SeoSkillId = "general";
  let bestScore = 0;
  for (const [id, keywords] of Object.entries(SKILL_KEYWORDS) as [
    Exclude<SeoSkillId, "general">,
    string[],
  ][]) {
    let score = 0;
    for (const kw of keywords) {
      if (q.includes(kw)) {
        // Multi-word matches are stronger signals than single-word ones
        score += kw.includes(" ") ? 3 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  // Require at least one match before switching off general
  if (bestScore < 1) return SEO_SKILLS[0];
  return findSkill(bestId);
}
