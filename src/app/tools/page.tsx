export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Activity,
  Bot,
  Camera,
  Code2,
  Compass,
  CornerDownRight,
  Eye,
  FileText,
  Flame,
  Gauge,
  GitMerge,
  Globe,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Link2,
  ListChecks,
  Lock,
  Map as MapIcon,
  Network,
  Newspaper,
  RefreshCw,
  ScanText,
  Send,
  ServerCog,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  Target,
  TrendingDown,
  Users,
  Video,
  Wand2,
  Wrench,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import {
  CATEGORY_LABELS,
  categoryOf,
  type ToolCategoryId,
} from "@/lib/tool-categories";

const tools = [
  {
    href: "/tools/health-check",
    icon: Stethoscope,
    title: "Full SEO health check ⭐",
    description:
      "One URL → audit + robots + hreflang + security + Core Web Vitals + image audit + redirect chain in parallel. Save snapshots to compare before / after.",
    accent: "violet",
  },
  {
    href: "/tools/browser-agent",
    icon: Bot,
    title: "Browser agent (goal-driven)",
    description:
      "Plain-English goal + a starting URL. Headless Chrome reads the page, decides the next step, and narrates each move with a screenshot. Replaces 'I need an API for that site' with browser automation.",
    accent: "violet",
  },
  {
    href: "/tools/trending",
    icon: Flame,
    title: "Trending content ideas",
    description:
      "Mines Google Trends rising queries, autocomplete a-z expansion, People Also Ask, related searches, Reddit threads. AI synthesises 10-15 publish-ready ideas.",
    accent: "amber",
  },
  {
    href: "/tools/traffic-drop",
    icon: TrendingDown,
    title: "Why did my traffic drop?",
    description:
      "Pulls last 28 vs prev 28 days from GSC. Diffs queries + pages, cross-references curated Google algorithm-update timeline, AI ranks the most likely cause.",
    accent: "rose",
  },
  {
    href: "/tools/serp-volatility",
    icon: Activity,
    title: "SERP volatility tracker",
    description:
      "Day-over-day position shifts across every tracked keyword. Volatility score spikes during algorithm updates — pause big content moves when stormy.",
    accent: "amber",
  },
  {
    href: "/tools/cannibalization",
    icon: GitMerge,
    title: "Keyword cannibalization",
    description:
      "Finds queries where 2+ of your pages compete in the SERP — Google can't pick a winner, both suffer. GSC-powered, severity-ranked, suggests which page to keep.",
    accent: "rose",
  },
  {
    href: "/tools/ai-schema",
    icon: Code2,
    title: "AI schema generator (from URL)",
    description:
      "Paste any URL — AI fetches, classifies content type, emits valid JSON-LD grounded in actual on-page content. Won't invent fields that aren't there.",
    accent: "cyan",
  },
  {
    href: "/tools/outreach-personalize",
    icon: Send,
    title: "Outreach personalizer",
    description:
      "Paste prospect URL + your generic template. AI mines their site for recent posts and topical signals, rewrites your opener with a specific reference. 2% → 15% reply rates.",
    accent: "rose",
  },
  {
    href: "/tools/brief",
    icon: FileText,
    title: "Content brief — one-click composite",
    description:
      "Type a query → top-10 SERP corpus + PAA → AI writes a writer-ready markdown brief: intent, length, H2 outline, semantic terms, FAQ block, internal-link anchors, snippet shape, CTA.",
    accent: "emerald",
  },
  {
    href: "/tools/cluster",
    icon: Layers,
    title: "Topic cluster builder",
    description:
      "Head topic → mine PAA + autocomplete + Reddit → AI assembles 1 pillar + 15-20 spokes with slugs, intent, format, and an interlinking map. The 1-day strategy plan, in 60 seconds.",
    accent: "cyan",
  },
  {
    href: "/tools/programmatic-seo",
    icon: Layers,
    title: "Programmatic SEO toolkit",
    description:
      "CSV + four templates → 100s-1000s of landing pages with sitemap + interlinking. Ideal for city × service combos and SaaS comparison pages.",
    accent: "violet",
  },
  {
    href: "/tools/og-image",
    icon: ImageIcon,
    title: "OG image generator",
    description:
      "1200×630 PNG cover image from a title + brand. 4 templates rendered in headless Chrome. No paid AI image API.",
    accent: "rose",
  },
  {
    href: "/tools/serp-features",
    icon: Sparkles,
    title: "SERP feature tracker (AIO + FS + PAA)",
    description:
      "Capture SERP snapshots over time — AI Overview citations, featured snippets, PAA questions. Surfaces snippet-takeover opportunities.",
    accent: "rose",
  },
  {
    href: "/tools/branded-split",
    icon: GitMerge,
    title: "Branded vs non-branded GSC split",
    description:
      "28-day clicks split with delta vs prior 28 days, separately for branded and non-branded queries. Different drops, different fixes.",
    accent: "amber",
  },
  {
    href: "/tools/robots-history",
    icon: Activity,
    title: "robots.txt history + diff",
    description:
      "Snapshot any host's robots.txt over time. Catches accidental Disallow: / disasters before they hurt indexing.",
    accent: "amber",
  },
  {
    href: "/tools/uptime",
    icon: Activity,
    title: "Uptime + TTFB monitor",
    description:
      "Add URLs to ping. Status code, latency, expected-text match. Self-hosted alternative to UptimeRobot.",
    accent: "emerald",
  },
  {
    href: "/tools/migration-parity",
    icon: GitMerge,
    title: "Migration URL-parity auditor",
    description:
      "Pre/post-launch URL parity check. Surfaces 404s, drifted redirects, off-host hops. Companion to the migration map generator.",
    accent: "amber",
  },
  {
    href: "/tools/hreflang-gen",
    icon: Globe,
    title: "Hreflang generator",
    description:
      "Paste language-region URL pairs, emit HTML / Link-header / sitemap blocks with x-default validation.",
    accent: "cyan",
  },
  {
    href: "/tools/wayback",
    icon: Activity,
    title: "Wayback Machine timeline",
    description:
      "How did a URL look 2 years ago? Internet Archive CDX, free, no key.",
    accent: "violet",
  },
  {
    href: "/tools/summarizer",
    icon: FileText,
    title: "AI content summarizer",
    description:
      "Long content → TL;DR + 5-7 takeaways + meta description + tweetable quote. Yoast Premium AI Summarize equivalent.",
    accent: "cyan",
  },
  {
    href: "/tools/bulk-alt",
    icon: ImageIcon,
    title: "Bulk image alt-text generator",
    description:
      "Crawl a URL, AI writes SEO alt text for every image based on nearby context. RankMath bulk image SEO equivalent.",
    accent: "emerald",
  },
  {
    href: "/tools/news-headline",
    icon: Newspaper,
    title: "News SEO — headline audit",
    description:
      "Score journalistic headlines for Top Stories fit, AP-style hook, length. AI suggests 3-5 alternates.",
    accent: "rose",
  },
  {
    href: "/tools/auto-link",
    icon: Link2,
    title: "Auto-link suggester (RankMath-style)",
    description:
      "Paste content + your internal page list. AI proposes contextual internal links — exact anchor + target — to add.",
    accent: "violet",
  },
  {
    href: "/tools/youtube-audit",
    icon: Video,
    title: "YouTube SEO audit",
    description:
      "Paste any YouTube URL → 14-point checklist (title, description, chapters, hashtags, tags, captions, thumbnail, like ratio, freshness) + AI fix steps. Free — uses oEmbed + watch-page scrape.",
    accent: "rose",
  },
  {
    href: "/tools/soft-404",
    icon: ScanText,
    title: "Soft 404 catcher",
    description:
      "Crawl + flag pages that return 200 but smell like 404s — thin content, '404' / 'page not found' text patterns, generic error titles. Silent indexation killers.",
    accent: "rose",
  },
  {
    href: "/tools/canonical-audit",
    icon: GitMerge,
    title: "Canonical conflict detector",
    description:
      "Crawl + flag every page where rel=canonical is missing, multiple, off-host, broken, redirect-target, or conflicts with noindex. Catches the silent indexation killer.",
    accent: "amber",
  },
  {
    href: "/tools/redirects-manager",
    icon: CornerDownRight,
    title: "Redirect manager + 404 monitor",
    description:
      "CRUD UI for 301/302/307/308/410 rules. 404 log with one-click 'turn this into a redirect'. POST to /api/v1/track-404 to log automatically.",
    accent: "amber",
  },
  {
    href: "/tools/gsc-coverage",
    icon: ListChecks,
    title: "GSC index coverage (batch)",
    description:
      "Paste 60 URLs, hit GSC URL Inspection for each. See which are indexed, blocked, or excluded — and the reason. Daily indexation check.",
    accent: "emerald",
  },
  {
    href: "/tools/redirects-bulk",
    icon: CornerDownRight,
    title: "Bulk redirect-chain tester",
    description:
      "Paste up to 100 URLs. Trace every redirect hop in parallel. Surfaces chains, loops, mixed-scheme jumps, broken 301s. Migration-day staple.",
    accent: "cyan",
  },
  {
    href: "/tools/migration-map",
    icon: GitMerge,
    title: "Migration redirect-map generator",
    description:
      "Old URL list + new URL list → 301 map. Token-overlap + path similarity scoring. Outputs Nginx, Apache .htaccess, and Next.js redirect blocks.",
    accent: "amber",
  },
  {
    href: "/tools/schema-validate",
    icon: ShieldCheck,
    title: "Schema validator (live URL)",
    description:
      "Fetches the URL, extracts every JSON-LD block, validates required fields by type. Complements the AI schema generator.",
    accent: "emerald",
  },
  {
    href: "/tools/social-preview",
    icon: Share2,
    title: "OG / Twitter card preview",
    description:
      "Render OG + Twitter card visually. Catches missing og:image, relative URLs, missing twitter:card — the silent killers of social CTR.",
    accent: "cyan",
  },
  {
    href: "/tools/mobile-friendly",
    icon: Smartphone,
    title: "Mobile-friendly checker",
    description:
      "Google deprecated theirs in 2023; this replaces it. Viewport, charset, responsive images, fixed-width elements, tap-target sizes, intrusive interstitials.",
    accent: "emerald",
  },
  {
    href: "/tools/anchor-distribution",
    icon: Link2,
    title: "Anchor-text distribution",
    description:
      "Per-URL anchor frequency, internal vs external split, exact-match % over-optimization detection, brand variation check.",
    accent: "violet",
  },
  {
    href: "/tools/dns-whois",
    icon: Globe,
    title: "DNS + WHOIS / RDAP",
    description:
      "A/AAAA/MX/NS/TXT/CAA + registrar + expiry. Catches missing SPF/DMARC/CAA, near-expiry domains, broken nameservers. No paid API — public RDAP.",
    accent: "cyan",
  },
  {
    href: "/tools/pagerank",
    icon: Network,
    title: "Internal PageRank simulator",
    description:
      "Crawls site, builds link graph, runs 30 iterations of PageRank. Surfaces authority hubs and starved pages so you know where to add internal links.",
    accent: "violet",
  },
  {
    href: "/tools/intent-classifier",
    icon: Compass,
    title: "Bulk search-intent classifier",
    description:
      "Paste 200 queries — AI labels each as info / nav / commercial / transactional / local + suggests content format. Falls back to regex if AI not configured.",
    accent: "cyan",
  },
  {
    href: "/tools/disavow",
    icon: ShieldCheck,
    title: "Disavow file generator",
    description:
      "Paste backlink list. Auto-flags toxic domains (spam TLDs, casino/payday/random subdomains) and emits a Google-spec disavow.txt.",
    accent: "rose",
  },
  {
    href: "/tools/render",
    icon: Camera,
    title: "JS render + screenshot",
    description:
      "Render any URL in headless Chrome — post-hydration HTML, full-page screenshot, redirect chain, response headers, console + network errors. Critical for SPAs.",
    accent: "cyan",
  },
  {
    href: "/tools/local-cwv",
    icon: Gauge,
    title: "Local Core Web Vitals (no PSI key)",
    description:
      "Measures LCP / FCP / CLS / TBT directly from PerformanceObserver. Lighthouse-equivalent 0-100 score, resource breakdown, top fixes by impact. No PageSpeed quota.",
    accent: "amber",
  },
  {
    href: "/tools/eeat-audit",
    icon: ShieldCheck,
    title: "E-E-A-T audit",
    description:
      "Score any URL on Experience / Expertise / Authoritativeness / Trust. Detects bylines, schema, citations, trust pages, then AI writes a fix punch list.",
    accent: "emerald",
  },
  {
    href: "/tools/refresh",
    icon: RefreshCw,
    title: "Content refresh detector",
    description:
      "Compare your published page to top-10 SERP. Surfaces missing topics, missing sections, plus a concrete refresh plan a writer can execute.",
    accent: "amber",
  },
  {
    href: "/tools/link-recommender",
    icon: Sparkles,
    title: "AI internal-link recommender",
    description:
      "Crawl your site + AI proposes 3-5 internal links with anchor + target + context snippet. Closes the gap on internal-linking opportunities humans miss.",
    accent: "violet",
  },
  {
    href: "/meta-rewrite",
    icon: Wand2,
    title: "Meta rewrite batch (low-CTR)",
    description:
      "Pulls GSC data, finds your worst CTR vs position. AI rewrites title + meta in 2 variants per page. One-click push to WordPress if connected.",
    accent: "rose",
  },
  {
    href: "/tools/content-helpers",
    icon: ImageIcon,
    title: "Cover-image prompts + category suggester",
    description:
      "Two AI helpers: 3 image-gen prompts in distinct visual styles for any post, plus primary category + 5-10 SEO tags scoped to your existing taxonomy.",
    accent: "rose",
  },
  {
    href: "/knowledge",
    icon: Compass,
    title: "SEO knowledge hub",
    description:
      "Ranking signals, topical authority, blogging rules, page-speed by stack, GBP playbook, knowledge graph, rich snippets, E-E-A-T — the in-app reference.",
    accent: "violet",
  },
  {
    href: "/tools/bulk-scan",
    icon: ListChecks,
    title: "Bulk URL scanner",
    description:
      "Paste up to 25 URLs. Run the full health check on each in parallel + save every result as a snapshot. Sortable table.",
    accent: "violet",
  },
  {
    href: "/tools/content-score",
    icon: Gauge,
    title: "Content scorer",
    description:
      "Paste content + target keyword. AI scores readability, density, structure, suggests LSI terms + specific edits.",
    accent: "emerald",
  },
  {
    href: "/tools/headers",
    icon: ServerCog,
    title: "HTTP headers + redirect chain",
    description:
      "Trace every redirect step + show full HTTP response headers at each hop. Critical for debugging canonicalization, redirects, and CDN config.",
    accent: "amber",
  },
  {
    href: "/tools/pixel-preview",
    icon: Eye,
    title: "Pixel preview",
    description:
      "See exactly how your title + meta description will look in Google's SERP. Click pre-cut, character counts, mobile + desktop.",
    accent: "violet",
  },
  {
    href: "/tools/hreflang",
    icon: Eye,
    title: "Hreflang validator",
    description:
      "Checks all hreflang tags (HTML + HTTP), validates format, x-default, self-reference, and reciprocal links across language variants.",
    accent: "cyan",
  },
  {
    href: "/tools/ai-overview",
    icon: Eye,
    title: "AI Overview optimizer",
    description:
      "AI scores your page's citation-worthiness for Google's AI Overviews. Specific changes to make ranked by impact.",
    accent: "rose",
  },
  {
    href: "/tools/schema",
    icon: Code2,
    title: "Schema markup generator",
    description:
      "AI generates valid JSON-LD for Article, LocalBusiness, FAQ, Product, Recipe, Event. Paste your URL — we extract the rest.",
    accent: "cyan",
  },
  {
    href: "/tools/robots",
    icon: FileText,
    title: "Robots.txt + sitemap validator",
    description:
      "Fetch + check robots.txt, sitemap.xml. Find blocked URLs, broken sitemap entries, indexability issues.",
    accent: "emerald",
  },
  {
    href: "/tools/security",
    icon: ShieldCheck,
    title: "Security headers + SSL grade",
    description:
      "Mozilla Observatory + SSL Labs. Free, no key. Surface fix-it actions for security ranking signals.",
    accent: "amber",
  },
  {
    href: "/tools/llms-txt",
    icon: Sparkles,
    title: "llms.txt manager",
    description:
      "Generate + validate llms.txt — the emerging standard for telling AI crawlers what your site is about.",
    accent: "rose",
  },
  {
    href: "/tools/domain-overview",
    icon: Globe,
    title: "Domain overview",
    description:
      "Every signal we can check ourselves — HTTPS, security headers, schema, on-page basics, indexed-pages estimate. Plus links to free external checkers for DA/DR.",
    accent: "violet",
  },
  {
    href: "/tools/link-checker",
    icon: LinkIcon,
    title: "Link analyzer",
    description:
      "Paste any URL → every <a> link classified internal/external + dofollow/nofollow, with anchor text frequency. Critical pre-publish check.",
    accent: "cyan",
  },
  {
    href: "/tools/keyword-difficulty",
    icon: Gauge,
    title: "Keyword difficulty",
    description:
      "Heuristic 0-100 score from real SERP signals — big-brand presence, SERP features, title competitiveness. AI summary if your AI key is configured.",
    accent: "amber",
  },
  {
    href: "/tools/external",
    icon: Globe,
    title: "External tools launchpad",
    description:
      "Paste a URL or keyword once → all 28 external tools (Moz DA, Ahrefs, SSL Labs, Wayback, etc.) open with that context pre-filled.",
    accent: "cyan",
  },
  {
    href: "/tools/internal-linking",
    icon: Link2,
    title: "Internal linking suggester",
    description:
      "Crawl your site, find pages that mention your target keyword without linking to your target URL. The fastest way to compound on-site authority.",
    accent: "violet",
  },
  {
    href: "/tools/link-graph",
    icon: Network,
    title: "Internal-link analyser",
    description:
      "Crawl + build link graph. Surfaces orphan pages and proposes top-3 source pages for each via TF-IDF cosine similarity. CSV / JSON export.",
    accent: "violet",
  },
  {
    href: "/tools/sitemap",
    icon: MapIcon,
    title: "Sitemap generator",
    description:
      "Crawl any site, generate sitemap.xml + plain-text URL list + human-readable HTML index. Respects robots.txt by default.",
    accent: "cyan",
  },
  {
    href: "/tools/indexnow",
    icon: Zap,
    title: "IndexNow submitter",
    description:
      "Push fresh URLs to Bing, Yandex, Naver, Seznam in seconds. Free, no API key — one verification file per host.",
    accent: "cyan",
  },
  {
    href: "/tools/bing",
    icon: Globe,
    title: "Bing Webmaster Tools",
    description:
      "Free Bing organic data — top queries, top pages, crawl issues, URL submission. Add a free Bing API key once.",
    accent: "cyan",
  },
  {
    href: "/tools/crux",
    icon: Activity,
    title: "Real-user CWV (CrUX)",
    description:
      "Real Chrome user data over the last 28 days. Same data Google uses for page-experience ranking. Free with a PageSpeed key.",
    accent: "emerald",
  },
  {
    href: "/tools/youtube",
    icon: Video,
    title: "YouTube keyword research",
    description:
      "Real video data — view counts, channels, recurring tag phrases. Free YouTube Data API tier (100 searches a day).",
    accent: "rose",
  },
  {
    href: "/tools/content-grader",
    icon: Gauge,
    title: "Content grader (Surfer / Clearscope replacement)",
    description:
      "Pulls top 10 SERP results, builds a TF-IDF corpus, scores your draft on length / term coverage / density. Free, browser-mode.",
    accent: "emerald",
  },
  {
    href: "/tools/backlink-discovery",
    icon: LinkIcon,
    title: "Backlink discovery",
    description:
      "DuckDuckGo + Common Crawl + crawl-to-confirm. Finds real verified backlinks with anchor text + rel. Closes the Ahrefs gap as much as is possible without a paid index.",
    accent: "violet",
  },
  {
    href: "/tools/search-volume",
    icon: Gauge,
    title: "Search-volume estimator",
    description:
      "Free directional volume bucket. Combines Google Trends, Google + Bing autocomplete, SERP characteristics. No paid keyword DB.",
    accent: "cyan",
  },
  {
    href: "/tools/plagiarism",
    icon: ScanText,
    title: "Plagiarism + AI detector",
    description:
      "AI-likelihood + originality scores on any draft. Flags AI-template phrases. Links to Copyleaks, GPTZero, Originality.ai for definitive web check.",
    accent: "rose",
  },
  {
    href: "/tools/ai-slop",
    icon: Sparkles,
    title: "AI slop detector (24 patterns)",
    description:
      "24 telltale AI writing patterns — significance inflation, negative parallelism, em-dash overuse, sycophancy. 90+ ships. Local, free, no AI call.",
    accent: "amber",
  },
  {
    href: "/tools/expert-panel",
    icon: Users,
    title: "Expert panel content scorer",
    description:
      "Auto-assembles 6-9 domain experts (incl. AI Detector + Brand Voice) and scores your draft. Target 90/100. Outputs each expert's specific revisions.",
    accent: "violet",
  },
  {
    href: "/tools/content-attack-brief",
    icon: Target,
    title: "Content attack brief",
    description:
      "Pulls GSC striking-distance queries, scores each by Impact × Confidence, AI-writes the attack angle for the top 10. Ranked by what moves the needle.",
    accent: "emerald",
  },
  {
    href: "/tools/meta-tag-generator",
    icon: Code2,
    title: "Meta tag generator",
    description:
      "Generates 3 angle-varied title + meta description options for any page, with SERP preview + Open Graph tags. Copy-paste HTML ready.",
    accent: "violet",
  },
  {
    href: "/tools/code-generator",
    icon: Code2,
    title: "SEO code / plugin generator",
    description:
      "AI writes the code you need to apply SEO changes — WordPress plugins, .htaccess rules, Elementor HTML, Shopify Liquid, Next.js routes, schema markup. With install steps + live preview.",
    accent: "violet",
  },
  {
    href: "/tools/reddit-research",
    icon: Flame,
    title: "Reddit research",
    description:
      "Reddit is in 40% of LLM citations. Mine real questions and pain points your audience asks — perfect FAQ + content brief seeds.",
    accent: "rose",
  },
  {
    href: "/algorithm-updates",
    icon: Lock,
    title: "Algorithm updates",
    description:
      "Timeline of every Google algorithm update with confirmed dates. Correlate against your traffic drops.",
    accent: "violet",
  },
  // 2026 SEO gap-closers
  {
    href: "/tools/person-schema",
    icon: ShieldCheck,
    title: "Person schema generator (E-E-A-T) ⭐",
    description:
      "Person JSON-LD is the top E-E-A-T signal in 2026 — Google's AI Mode uses it for entity verification. Fill in author details, get a copy-paste <script>.",
    accent: "violet",
  },
  {
    href: "/tools/aio-passage",
    icon: Sparkles,
    title: "AI Overview passage optimizer ⭐",
    description:
      "AIs cite 134-167 word self-contained passages. We split your draft, score each chunk on length / self-containment / Q→A / specifics / citations, and AI-rewrite the weak ones.",
    accent: "violet",
  },
  {
    href: "/tools/reputation-abuse-risk",
    icon: ShieldCheck,
    title: "Site reputation abuse risk scan",
    description:
      "Google now algorithmically demotes sections 'starkly different' from the main site. Crawl + group by path + score topical coherence so you don't lose authority.",
    accent: "rose",
  },
  {
    href: "/tools/ai-citation-tactics",
    icon: Sparkles,
    title: "AI citation tactics (per platform)",
    description:
      "Only 11% of cited domains overlap between ChatGPT and Perplexity. Niche-specific priority + concrete tactics for each platform: ChatGPT, Perplexity, Claude, Gemini, AI Overviews.",
    accent: "violet",
  },
  // 2026 SEO rules — second wave
  {
    href: "/tools/crux-origin",
    icon: Gauge,
    title: "CrUX Origin Summary",
    description:
      "Google's CWV ranking signal uses 28-day origin-level field data, not URL-level. Compare URL vs origin scopes side-by-side so you don't optimize the wrong thing.",
    accent: "cyan",
  },
  {
    href: "/tools/perf-budget",
    icon: Gauge,
    title: "Performance budget enforcement",
    description:
      "Define byte / request / Core Web Vitals budgets. We measure actuals via PageSpeed + CrUX and surface every line item over budget. Catch regressions before prod.",
    accent: "amber",
  },
  {
    href: "/tools/facet-trap",
    icon: Network,
    title: "Faceted-nav crawl-trap detector",
    description:
      "Filter / sort / pagination params can balloon a crawl from thousands to millions of near-duplicates. We crawl + group URLs by query shape and flag groups needing canonical/noindex protection.",
    accent: "rose",
  },
  {
    href: "/tools/screenshot-import",
    icon: ScanText,
    title: "Screenshot import — paid-tool data parser",
    description:
      "Drag a screenshot from Ahrefs / Semrush / GSC / GA4. AI vision extracts the structured data so you can stop paying for tools you only use occasionally.",
    accent: "violet",
  },
  {
    href: "/tools/github-pr",
    icon: GitMerge,
    title: "GitHub PR generator for SEO fixes",
    description:
      "For sites without a CMS write-bridge (Next.js / custom code), open a structured PR with a checklist of SEO fixes for your developer to implement.",
    accent: "cyan",
  },
  // GEO + SXO + attack briefs (from open-source SEO-skill repos)
  {
    href: "/tools/geo-score",
    icon: Sparkles,
    title: "GEO composite score ⭐",
    description:
      "Weighted scorecard for AI search visibility — citability, brand authority, content E-E-A-T, technical, schema, platform tactics. Forces you to fix the weakest leg first.",
    accent: "violet",
  },
  {
    href: "/tools/sxo",
    icon: Eye,
    title: "SXO — Search Experience Optimization",
    description:
      "Audits user-experience signals Google now weights heavily: page promise, time-to-answer, next step, friction, Core Web Vitals. Persona-driven recommendations.",
    accent: "cyan",
  },
  {
    href: "/tools/attack-briefs",
    icon: Sparkles,
    title: "Content Attack Briefs",
    description:
      "Up to 5 keyword-gap briefs per run. Vulnerability scoring + required E-E-A-T + schema + AIO passage hints + definition of done.",
    accent: "rose",
  },
  {
    href: "/tools/image-gen",
    icon: ImageIcon,
    title: "AI image generation (BYO OpenAI key)",
    description:
      "DALL·E 3 hero / OG / illustrative images. Aspect + quality + style controls. Output downloaded directly — no server storage.",
    accent: "violet",
  },
  {
    href: "/tools/utm-attribution",
    icon: Network,
    title: "Multi-touch attribution (UTM)",
    description:
      "First-touch, last-touch, assisted, linear, position-based attribution from any UTM-tagged touch CSV. No CRM needed.",
    accent: "violet",
  },
  {
    href: "/tools/rank-where",
    icon: Compass,
    title: "Where do I rank? (country-aware) ⭐",
    description:
      "Find your exact position for any keyword × country in Google's top 100. See who outranks you, AI Overview presence + citation, specific fixes to climb.",
    accent: "emerald",
  },
  {
    href: "/tools/wp-hack-scan",
    icon: ShieldCheck,
    title: "WordPress hack / malware scan ⭐",
    description:
      "Probes a live WP site for compromise indicators: backdoor files, exposed configs, JS injection, hidden iframes, spam injection, cloaking. Returns containment + cleanup + prevention playbook.",
    accent: "rose",
  },
];

const accentMap: Record<string, string> = {
  violet: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
  cyan: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30",
  emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  rose: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
};

// Render categories in this specific order — most-used first.
const CATEGORY_ORDER: ToolCategoryId[] = [
  "everyday",
  "audit",
  "ai-geo",
  "content",
  "keywords",
  "backlinks",
  "technical",
  "generators",
  "migration",
  "local",
  "specialty",
];

type Tool = (typeof tools)[number];

export default function ToolsHubPage() {
  // Bucket every tool into its category. Tools without a category fall
  // through to "specialty" via categoryOf().
  const byCategory = new Map<ToolCategoryId, Tool[]>();
  for (const t of tools) {
    const cat = categoryOf(t.href);
    const arr = byCategory.get(cat) ?? [];
    arr.push(t);
    byCategory.set(cat, arr);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Tools"
        description="100+ SEO utilities, grouped by what you'll use them for. Tip: ⌘K (Ctrl+K) opens the global search — type any tool name and jump straight there."
        icon={Wrench}
        accent="violet"
      />

      {/* Quick category jump-links */}
      <nav className="flex flex-wrap gap-1.5">
        {CATEGORY_ORDER.map((cat) => {
          const list = byCategory.get(cat);
          if (!list || list.length === 0) return null;
          return (
            <a
              key={cat}
              href={`#cat-${cat}`}
              className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-foreground"
            >
              {CATEGORY_LABELS[cat].label}
              <span className="rounded-full bg-white/10 px-1.5 text-[10px]">
                {list.length}
              </span>
            </a>
          );
        })}
      </nav>

      {CATEGORY_ORDER.map((cat) => {
        const list = byCategory.get(cat);
        if (!list || list.length === 0) return null;
        const meta = CATEGORY_LABELS[cat];
        return (
          <section
            key={cat}
            id={`cat-${cat}`}
            className="scroll-mt-20 space-y-3"
          >
            <header className="space-y-0.5">
              <h2 className="text-lg font-semibold tracking-tight">
                {meta.label}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({list.length})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                {meta.description}
              </p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="glass-apple lift-on-hover group relative overflow-hidden rounded-2xl p-5"
                >
                  <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-violet-500/10 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative space-y-3">
                    <div
                      className={`inline-flex size-10 items-center justify-center rounded-xl ring-1 ring-inset ${accentMap[t.accent]}`}
                    >
                      <t.icon className="size-5" />
                    </div>
                    <h3 className="text-base font-semibold">{t.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
