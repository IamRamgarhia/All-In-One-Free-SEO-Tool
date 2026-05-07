/**
 * SEO knowledge corpus that backs the SEO Chat. Each section is a tightly
 * scoped fact-set the AI can lean on instead of inventing. Sections are
 * matched against the user's query via keyword + tag scoring (no
 * embeddings — fast, deterministic, free).
 *
 * Adding to this file is the cheapest way to make the chat smarter:
 * the model gets focused factual context, fewer hallucinations, fewer
 * wasted tokens on rambling preamble.
 */

export type SeoKnowledgeChunk = {
  id: string;
  title: string;
  /** Tags + keywords used to retrieve this chunk. Lowercase. */
  tags: string[];
  /** Short body — kept ≤300 words to stay token-efficient. */
  body: string;
  /** Tools to suggest alongside this chunk. */
  tools?: string[];
};

export const SEO_KNOWLEDGE: SeoKnowledgeChunk[] = [
  // =================== Ranking signals ===================
  {
    id: "ranking-signals-2026",
    title: "Google's confirmed ranking signals (2026)",
    tags: [
      "ranking",
      "factor",
      "google",
      "what matters",
      "signals",
      "core",
      "algorithm",
    ],
    body: `Google has 200+ ranking signals; ~10 do most of the work.
- Helpful, people-first content (Helpful Content System, baked into core since 2024)
- Quality + relevance of inbound links
- E-E-A-T signals (Experience, Expertise, Authoritativeness, Trust) — heaviest on YMYL queries
- Search-intent match (format the SERP demands)
- Topical authority (full-cluster coverage, not single posts)
- Page experience: Core Web Vitals (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1), mobile-friendly, HTTPS
- Freshness (for queries that demand it)
- Internal linking depth + descriptive anchors
- Structured data (eligibility for rich results)
- Original research / data / experience

What barely matters or is folklore: keyword density, exact-match URL slugs, meta keywords, word count alone, single-H1 rule, domain age, bounce rate (Google has confirmed they don't use it directly).`,
    tools: ["/knowledge", "/tools/eeat-audit"],
  },
  {
    id: "eeat-deep",
    title: "E-E-A-T — what's actually scored",
    tags: ["eeat", "e-e-a-t", "experience", "expertise", "authority", "trust", "ymyl"],
    body: `E-E-A-T is most weighted on YMYL queries (your-money-your-life: health, finance, legal, news). Google's quality raters score these signals visually:

Experience: Author has actually used / done / experienced the thing. Real screenshots, photos, first-person language ("I ran 12 of these for 6 months"), original measurements.
Expertise: Credentials, years, specialism. Bio with verifiable facts. For YMYL, a reviewer line ("Medically reviewed by Dr. X").
Authoritativeness: External signals — citations, mentions, brand entity in the knowledge graph (Wikidata, Wikipedia, Crunchbase, sameAs schema).
Trust: HTTPS, contact page, About page, privacy policy, editorial policy, dates (published + updated), citations to authoritative sources (.gov / .edu / known publishers).

Concrete fixes that move E-E-A-T fastest:
1. Add author byline on every post → /author/<slug> page with bio + sameAs
2. Add Person + Organization schema with sameAs to LinkedIn, Twitter, Wikidata
3. Add "last-updated" dates to published posts; refresh + bump every 90-180 days
4. Add 3-5 outbound citations to authoritative sources per article
5. Add a Reviewer / Fact-checker line on YMYL content`,
    tools: ["/tools/eeat-audit", "/tools/ai-schema"],
  },
  {
    id: "topical-authority",
    title: "Topical authority — hub-and-spoke architecture",
    tags: [
      "topical",
      "authority",
      "cluster",
      "pillar",
      "spoke",
      "hub",
      "topic",
      "silo",
    ],
    body: `Topical authority is why Backlinko / Healthline / Yoast dominate their niches. Google trusts them as the canonical source on a topic because they cover it comprehensively.

Hub-and-spoke model:
- 1 pillar / hub page (3,000-8,000 words) — definitive guide on the broad topic
- 15-30 spoke pages — each covers one specific subtopic (PAA question, related search, comparison)
- Internal linking: hub → all spokes; spokes → hub + 2-4 peer spokes

Coverage targets: ~15-30 pages per major cluster. Below that, you're not credibly an authority.

Build the cluster as ONE batch over 4-8 weeks — partial clusters underperform because the internal linking isn't dense enough yet. Single-post strategy on unrelated topics never compounds.`,
    tools: ["/tools/cluster", "/tools/brief", "/topic-clusters"],
  },

  // =================== Technical ===================
  {
    id: "crawl-budget",
    title: "Crawl budget + indexability",
    tags: [
      "crawl",
      "budget",
      "googlebot",
      "indexing",
      "indexation",
      "robots",
      "discovered",
      "not indexed",
    ],
    body: `Crawl budget = Googlebot's allotted requests per day for your site. Mostly relevant for sites with 10k+ URLs. Common waste:
- Parameter URLs (?sort= ?filter=) — massive bot traffic for zero indexed pages
- 4xx and 5xx pages still being crawled
- Duplicate URLs without canonicals
- Sitemaps with non-indexable URLs
- Internal redirect chains

GSC index-coverage states:
- Crawled — currently not indexed: page is fine technically; Google decided not to index it. Usually content quality / duplication. Improve content depth + remove from sitemap if low priority.
- Discovered — currently not indexed: Googlebot found the URL but hasn't crawled it yet. Sign of crawl-budget pressure. Improve sitemap, internal linking, or page priority.
- Page with redirect: redirect chain or canonical mismatch.
- Excluded by 'noindex' tag: intentional — verify it's intentional.
- Soft 404: page returned 200 but has no content. Fix or 410.

Tools: /tools/log-analyzer, /tools/gsc-coverage, /tools/redirects-bulk.`,
    tools: ["/tools/log-analyzer", "/tools/gsc-coverage", "/tools/redirects-bulk"],
  },
  {
    id: "core-web-vitals",
    title: "Core Web Vitals — LCP / INP / CLS",
    tags: [
      "cwv",
      "core web vitals",
      "lcp",
      "inp",
      "cls",
      "ttfb",
      "page experience",
      "performance",
      "speed",
    ],
    body: `2026 thresholds (75th percentile mobile):
- LCP (Largest Contentful Paint) ≤2.5s — hero image / hero text typically
- INP (Interaction to Next Paint) ≤200ms — replaced FID in March 2024
- CLS (Cumulative Layout Shift) ≤0.1 — visual stability
- TTFB (Time to First Byte) ≤600ms — feeds everything else

LCP fix order (highest impact first):
1. Identify the LCP element via Lighthouse
2. Preload it: <link rel="preload" as="image" fetchpriority="high">
3. Convert to WebP/AVIF, target <100KB
4. Eliminate render-blocking CSS / JS above the fold
5. Reduce TTFB (caching, CDN, faster hosting)

INP fixes:
- Defer / async JS that runs on interaction
- Break up long tasks (>50ms) with scheduler.yield() or setTimeout(0)
- Reduce bundle size; use React.lazy / dynamic imports

CLS fixes:
- width + height on every image
- Reserve space for ads / late-loaded widgets
- Avoid injecting content above existing content
- font-display:optional or preload critical fonts`,
    tools: ["/tools/local-cwv", "/tools/health-check"],
  },
  {
    id: "schema-rich-results",
    title: "Schema types that still produce rich results in 2026",
    tags: [
      "schema",
      "structured data",
      "rich results",
      "json-ld",
      "snippet",
      "faq",
      "howto",
      "product",
      "article",
    ],
    body: `Still produces rich results:
- Article / NewsArticle / BlogPosting — top stories enrichment
- Product — price, availability, reviews (only with real third-party aggregator review data)
- Recipe — full recipe carousel
- Event — date, location, ticket
- LocalBusiness — knowledge panel
- VideoObject — thumbnail + duration
- BreadcrumbList — replaces ugly URL in result
- Organization — knowledge panel + sameAs entity linking
- Person — author entity linking
- HowTo — desktop only, only for genuinely procedural content

Stopped producing rich results (skip / deprioritize):
- FAQ on commercial pages — Google rolled this back in August 2023; only kept for .gov / authoritative-health
- HowTo on mobile — same rollback
- Self-claimed Review schema with no third-party source

Implementation rules:
- Schema must reflect what's actually visible on the page (faking it = manual action)
- Use JSON-LD in <head>, not microdata
- Validate every page in Google Rich Results Test before shipping
- One canonical entity per page`,
    tools: ["/tools/ai-schema", "/tools/schema-validate"],
  },
  {
    id: "robots-txt",
    title: "robots.txt + indexing directives",
    tags: [
      "robots",
      "robots.txt",
      "noindex",
      "disallow",
      "crawl",
      "ai bots",
      "gptbot",
      "google-extended",
    ],
    body: `robots.txt controls crawling, NOT indexing. A page Disallowed in robots.txt can still be indexed (without snippet) if linked externally. To prevent indexing, use <meta name="robots" content="noindex"> instead.

Common rules in 2026:
- Allow: / (the default — only Disallow what you mean to)
- Disallow: /search?, /tag/, /?p= (parameter / search URLs that have no SEO value)
- Disallow: /wp-admin/, /admin/, /private/

AI bot policy decisions (set explicitly):
- GPTBot — OpenAI training. Block if you don't want to feed training; allow if you want to be cited by ChatGPT.
- ClaudeBot — Anthropic same.
- PerplexityBot / Perplexity-User — Perplexity citations.
- OAI-SearchBot — ChatGPT Search retrieval (separate from training!).
- Google-Extended — Google AI training. Distinct from Googlebot. Block this without affecting Google Search ranking.

Recommended 2026 stance: allow OAI-SearchBot, PerplexityBot, ClaudeBot (you want citations), block Google-Extended (training without ranking benefit), allow GPTBot only if you're OK with training.`,
    tools: ["/tools/robots", "/tools/llms-txt", "/tools/robots-history"],
  },
  {
    id: "redirects-best-practices",
    title: "301 redirects — when, how, and what to avoid",
    tags: [
      "301",
      "302",
      "redirect",
      "redirects",
      "migration",
      "url change",
      "permanent",
    ],
    body: `301 (permanent) passes ~99% of link equity per Google. Use for moves that won't change back.
302 (temporary) passes equity now (Google treats it like 301 if it stays for months) but signals impermanence — use only if reverting in <30 days.
307 (temporary, preserves method) — for HTTPS upgrades / dev redirects.
308 (permanent, preserves method) — same as 301 but preserves POST/PUT — rarely needed for SEO.
410 (gone) — use INSTEAD of 404 when content is intentionally deleted with no replacement.

Anti-patterns:
- Redirect chains (A→B→C). Browser still gets there but each hop loses some equity. Aim for 1 hop.
- Redirecting all 404s to homepage. Google considers this a "soft 404" and will eventually treat the homepage as low-quality. Redirect only when there's a relevant target; otherwise serve 410.
- Mixing http↔https in chain. Pick one (https), 301 everything else to it.

Migration tip: build the redirect map BEFORE launching, validate with /tools/migration-parity post-launch.`,
    tools: [
      "/tools/migration-map",
      "/tools/redirects-bulk",
      "/tools/redirects-manager",
      "/tools/migration-parity",
    ],
  },

  // =================== On-page ===================
  {
    id: "title-tags",
    title: "Title tag rules (2026)",
    tags: ["title", "title tag", "meta title", "serp", "click-through"],
    body: `Length: 30-60 chars (~525 px). Google rewrites if too long, too short, or too generic.
Format that wins CTR: <Primary keyword> | <Differentiator/benefit> | <Brand>
Example: "Best espresso machines under $500 (2026 tested) — Acme"

Rules:
- Front-load the primary keyword
- Don't duplicate across pages — every title unique
- Match search intent. Listicle queries → "Best 9 X for Y", how-to queries → "How to X (step-by-step)"
- Don't keyword-stuff — Google rewrites
- Skip pipes when title is short; use dashes for tight separators
- Consider year/version: "(2026)" or "(updated)" — bumps CTR ~3-7% for review queries

Google rewrites titles ~30% of the time. Common rewrite triggers: poor click-through, mismatch with H1, brand-stuffing, length excess.`,
    tools: ["/tools/pixel-preview", "/meta-rewrite", "/tools/title-tests"],
  },
  {
    id: "meta-descriptions",
    title: "Meta description best practices",
    tags: ["meta", "description", "snippet", "ctr", "click-through"],
    body: `Length: 120-160 chars (160 max — Google truncates above ~158).
Goal: increase CTR (Google doesn't use meta description as a ranking factor since 2009, but click-through behavior is a signal).

Format that wins:
- Lead with what the page delivers (not what the page is)
- Include the primary keyword once
- One specific number or proof point
- One soft CTA ("See the full breakdown" / "Compare side-by-side")

Example: "Compared 47 home espresso machines over 30 days. The Breville Bambino beat the Gaggia Classic Pro on price, ease-of-use, and crema. See the full ranking inside."

Rules:
- Every page unique
- Don't end mid-sentence
- Don't keyword-stuff
- Don't include the year unless it's review content (resets CTR each January)`,
    tools: ["/tools/pixel-preview", "/meta-rewrite"],
  },
  {
    id: "internal-linking",
    title: "Internal linking — depth, anchor text, distribution",
    tags: ["internal links", "linking", "anchor", "anchor text", "pagerank"],
    body: `Internal linking does 4 jobs: distributes PageRank, helps Google discover pages, signals topical relationships, and helps users navigate.

Rules:
- 5-15 contextual links per article (in the body, not just nav)
- Descriptive anchor text — never "click here" / "this article"
- Link to deep pages, not just home/category
- Link from new content to old (and old to new — refresh old posts to add links to new ones)
- Hub → all spokes; spokes → hub + 2-4 peer spokes
- Aim for at least 3 internal links pointing to every important page

Anti-patterns:
- Sitewide footer links to commercial pages (devalued)
- Same anchor text repeatedly to the same target (over-optimization)
- Orphan pages (no inbound internal links) — they don't get crawled often, won't rank
- Linking to non-canonical URLs

Pro move: run a PageRank simulation (/tools/pagerank) — find pages with high computed PR but low traffic (under-leveraged authority) and pages with low PR but high commercial intent (need more inbound links).`,
    tools: [
      "/tools/link-recommender",
      "/tools/auto-link",
      "/tools/anchor-distribution",
      "/tools/pagerank",
    ],
  },

  // =================== Content ===================
  {
    id: "content-length",
    title: "Content length by format (2026)",
    tags: ["length", "word count", "long-form", "content", "format"],
    body: `Word count alone is not a ranking factor. But longer content correlates with rankings on competitive queries because it tends to be more comprehensive.

Length by format (average top-10):
- How-to / tutorial: 1,200-2,200 words
- Listicle (top 10 / best X): 1,800-3,500 words
- Ultimate guide / pillar: 3,000-8,000 words
- Comparison (X vs Y): 1,500-2,500 words
- Definition / quick answer: 400-900 words
- Case study / data study: 1,500-3,000 words
- Product / category page: 600-1,200 words

Match the SERP median, don't just write 5,000 words for everything. /tools/content-grader pulls the corpus median for any query.

Anti-pattern: padding to hit a word count. Google's helpful-content system explicitly devalues "content with little added value" — quality > quantity.`,
    tools: ["/tools/content-grader", "/tools/refresh", "/tools/brief"],
  },
  {
    id: "content-refresh",
    title: "Content refresh strategy",
    tags: ["refresh", "update", "freshness", "decay", "old content"],
    body: `Refreshing existing posts often outperforms publishing new. Top-ranking sites (Backlinko, SEJ) spend ~30-40% of editorial time on refreshes.

When to refresh:
- Page is dropping in rankings (5+ positions over 30 days)
- Content has stale dates / stats / screenshots
- New top-10 competitors entered the SERP after your post
- A change in user intent (SERP format flipped from informational to commercial)

What to actually update:
- Bump publishedDate AND dateModified — Google rewards demonstrable freshness
- Replace screenshots / examples / stats — visible recency
- Check facts; remove now-wrong claims
- Add coverage of new subtopics that have emerged (PAA / new related searches)
- Re-check internal linking; add links to + from newer content

Rule of thumb: full refresh on flagship pages every 60-90 days; light refresh quarterly on the long tail.

Don't republish a substantively different article at the same URL without a 301 if the URL needs to change.`,
    tools: ["/tools/refresh", "/content-decay"],
  },
  {
    id: "search-intent",
    title: "Search intent — informational / commercial / transactional / navigational / local",
    tags: ["intent", "search intent", "informational", "commercial", "transactional", "navigational"],
    body: `Search intent is the dominant ranking factor on competitive queries — match the SERP format or you won't rank, regardless of content quality.

The 5 intents:
- Informational: "how to", "what is", "guide". Win with: how-to articles, definitions, ultimate guides.
- Commercial: "best", "vs", "review", "alternative". Win with: listicles, comparisons, reviews. Highest revenue per ranking.
- Transactional: "buy", "price", "near me". Win with: product pages, pricing pages, location pages.
- Navigational: "Reddit", "Wikipedia", "youtube". Don't try to rank for these unless you ARE the brand.
- Local: "near me", city + service. Win with: local landing pages, GBP, citations.

How to detect intent:
1. Look at top-5 SERP results — what format dominates?
2. Check SERP features: AIO + featured snippet → informational; map pack → local; product carousel → transactional.
3. /tools/intent-classifier auto-classifies bulk queries.

Intent shift: if the SERP changes (e.g., "best laptops" was listicles in 2022, now AIO + product carousel), your content has to shift too.`,
    tools: ["/tools/intent-classifier", "/tools/serp-features"],
  },

  // =================== Local ===================
  {
    id: "local-seo-fundamentals",
    title: "Local SEO — GBP + citations + reviews",
    tags: ["local", "gbp", "google business profile", "local pack", "citations", "nap", "near me"],
    body: `Local pack ranking is dominated by 3 factors:
- Proximity (you can't change)
- Relevance (categories, services, content match)
- Prominence (review velocity, citations, mentions)

GBP setup non-negotiables:
- Exact business name (no keyword-stuffing — Google demotes for it)
- Primary category — most specific match
- 3-5 secondary categories
- NAP exactly matching website + every directory citation
- Hours including holidays
- Service area (if no public address)
- Photos: 10+ minimum, mixed (exterior, interior, team, products)
- Products / services — every offering
- Attributes (accessibility, payment methods, identity-owned)

Reviews: target 4.5+ avg, 1+ new review/week sustained, reply to every one within 24h. Use a short link (g.page/r/<id>) on receipts + thank-you screens.

Citations: top tier = Apple Business Connect, Bing Places, Yelp, Facebook, Foursquare, BBB. Niche citations matter more than 100 generic ones (a dental practice on Healthgrades + ZocDoc beats 50 random listings).

Posts: 1-3/week. Mix offers / events / updates / products / stories. 1200×900 image. Hook in first 12 words. Always a CTA button.`,
    tools: ["/gbp", "/citations", "/local-rank", "/local-grid"],
  },

  // =================== AI search visibility ===================
  {
    id: "ai-search-visibility-2026",
    title: "AI search visibility — AIO, ChatGPT Search, Perplexity",
    tags: [
      "ai overview",
      "aio",
      "chatgpt search",
      "perplexity",
      "ai citation",
      "llm",
      "generative search",
    ],
    body: `2026 reality: Google AI Overviews appear on ~47% of commercial queries. Reddit is in ~40% of LLM citations. Perplexity matches Google's top-10 in 91% of cases. Citations from these surfaces are the new "above-the-fold."

How to win citations:
1. Citation-worthy content structure: clear factual claims with explicit numbers, named frameworks, original data. LLMs prefer specific over general.
2. Strong brand entity: Wikidata entry, Wikipedia mention (if notable), Organization schema with sameAs to LinkedIn / Crunchbase / GitHub. LLMs ingest entities, not URLs.
3. Reddit + niche-forum presence: real answers under personal accounts. Reddit dominates LLM training data.
4. AI bot policy: allow OAI-SearchBot, PerplexityBot, ClaudeBot (you want citations). Block Google-Extended (training without ranking benefit) if you don't want training. GPTBot is your call.
5. llms.txt at /llms.txt: emerging standard, low-cost to publish.

Anti-patterns: keyword density tuning, exact-match domains, AI-generated content without editing (Search Engine Land study: human content is 8× more likely to rank #1).`,
    tools: ["/ai-visibility", "/tools/serp-features", "/tools/llms-txt", "/bot-logs"],
  },

  // =================== Image / video ===================
  {
    id: "image-seo",
    title: "Image SEO — alt, filename, format, schema",
    tags: ["image", "alt", "alt text", "image seo", "webp", "avif", "image sitemap"],
    body: `Alt text:
- ≤120 chars, plain English, no "image of"
- Describe what's in the image, not the page topic
- Include primary keyword naturally if it fits — don't force
- Decorative images: alt="" (empty, not missing)

Filename:
- kebab-case-keywords.webp NOT IMG_1234.JPG
- 3-6 descriptive words, primary keyword first

Format priority: AVIF > WebP > JPEG (photos) / PNG (transparency) / SVG (graphics, logos). Most platforms auto-convert; Cloudflare Polish + Polish:Lossy is a one-toggle win.

Compression targets: <100KB hero, <50KB inline. Use srcset for responsive variants (1x, 2x, 3x).

Image sitemap: useful only if you have ≥1000 visually-important images (e-commerce, real estate, photography). Otherwise the regular sitemap suffices.

ImageObject schema: for high-priority images (hero of a Recipe / Product / how-to step). Include contentUrl + license + creator.

Lazy loading: loading="lazy" on every below-the-fold image. Hero LCP image gets fetchpriority="high" + NO lazy.`,
    tools: ["/tools/bulk-alt", "/image-audit", "/tools/ai-schema"],
  },

  // =================== Migrations ===================
  {
    id: "migration-checklist",
    title: "Site migration — pre/during/post checklist",
    tags: ["migration", "site migration", "redesign", "url change", "domain change"],
    body: `Migrations break sites. Sub-5% volatility for clean ones, 20-40% for messy ones.

Pre-launch (T-30 days):
- Full URL inventory (sitemap.xml + GSC export + log file analysis)
- Generate redirect map: every old URL → new URL (use /tools/migration-map)
- Re-check redirect map against analytics top-1000 pages
- Stage on a noindex'd subdomain; do a full crawl
- Test critical user flows on the staging site

Pre-launch (T-7 days):
- Submit final redirect map to dev for review
- Verify GSC + GA4 are configured for the new property
- Plan announcement (the migration itself is invisible to most clients)

Launch day:
- Push 301 redirects + new robots.txt + new sitemap simultaneously
- Submit new sitemap to GSC + Bing
- Re-verify GSC ownership (do BOTH the old and new property — keeps history)

Post-launch (T+1 to T+30):
- Day 1: hit every top-100 URL — confirm 301 chain (use /tools/migration-parity)
- Day 3: GSC errors check
- Day 7: traffic comparison vs prior 7 days; expect <5% volatility
- Day 14: rank tracker comparison; investigate any drops > 5 positions
- Day 30: full audit report, finalize fixes`,
    tools: [
      "/tools/migration-map",
      "/tools/migration-parity",
      "/tools/redirects-bulk",
      "/tools/gsc-coverage",
    ],
  },

  // =================== Penalty / recovery ===================
  {
    id: "penalty-recovery",
    title: "Penalty + algorithmic-hit recovery",
    tags: ["penalty", "manual action", "recovery", "drop", "helpful content", "algorithm"],
    body: `Two types of trouble:
1. Manual action (visible in GSC). Includes "Pure Spam", "Unnatural Links", "Thin Content", "User-Generated Spam". Fix the issue, file reconsideration request. Resolution: weeks.
2. Algorithmic hit (silent). Spotted via GSC drop coinciding with a confirmed Google update. /tools/traffic-drop cross-references your data with the algorithm-update timeline.

Recent updates worth knowing:
- 2024-08 (HCS recovery): partially reversed earlier helpful-content over-corrections
- 2024-03 spam update: largest spam crackdown — AI-generated, scaled-content, expired-domain abuse all hit
- 2024-03 core update: hit thin-content / AI-heavy sites hard

Helpful Content System recovery:
- Slow (6-12 months typical)
- Focus on PAGE-LEVEL quality, not site-level "fix everything"
- Most-traffic pages first; if they're thin, expand or remove (don't keep)
- Original research / case studies / first-person experience
- Strengthen E-E-A-T signals
- Cut low-value pages: out-of-stock, thin tag pages, expired event pages

Disavow file: rare in 2026. Google says they ignore most spammy links automatically. Use only when you can document targeted negative SEO and have a manual action explicitly mentioning links.`,
    tools: [
      "/tools/traffic-drop",
      "/tools/disavow",
      "/algorithm-updates",
      "/tools/eeat-audit",
    ],
  },

  // =================== Modern AI / structured ===================
  {
    id: "structured-content-2026",
    title: "Structured content for snippets + AI Overviews",
    tags: ["snippet", "featured snippet", "paragraph snippet", "list snippet", "aio answer", "structured content"],
    body: `2026 wins paragraph snippets via:
- H2-as-question + 40-60 word direct answer immediately after
- Plain English, no preamble
- Specific (numbers, names, dates) — not vague

Wins list snippets via:
- Ordered list IF intent is sequential (steps, ranking)
- Unordered list IF intent is comparative or descriptive
- Each item leads with the named entity, then 1-line explanation

Wins table snippets via:
- Table with header row
- 4-7 rows ideal
- Comparison-style content (price, feature, vs)

For AIO (AI Overview) citations:
- Make claims VERY explicit (subject, verb, fact, number)
- Cite sources within the page
- Original content gets cited 8× more than aggregated takes
- Be the most trusted entity in the niche (E-E-A-T + Wikidata)`,
    tools: ["/tools/serp-features", "/tools/ai-overview"],
  },

  // =================== Backlinks ===================
  {
    id: "link-building-2026",
    title: "Link building that still works in 2026",
    tags: ["backlinks", "link building", "outreach", "digital pr", "haro", "broken link"],
    body: `What works (in order of ROI):
1. Digital PR / data studies. Original research → press release / journalist outreach. Most reliable way to earn .gov / .edu / news-tier links. Effort: high. Payoff: very high.
2. HARO / Qwoted / Help A B2B Writer. 15 min/day = 2-3 high-tier links/month consistently. Compound over a year = 30+ links from outlets you couldn't outreach to cold.
3. Broken link building. Find broken pages on niche sites that linked to your topic. Email webmaster with a working replacement. Conversion 5-15%.
4. Resource-page outreach. Search "inurl:resources" + your niche; pitch your free tool / definitive guide.
5. Niche edits (link insertions). Find existing relevant articles on authoritative sites; pitch a section update where your link adds value. Doesn't require new content from them.
6. Guest posting (selectively). Only on sites with real readers + editorial standards. PBN-style guest posting is devalued.

What doesn't work in 2026:
- PBNs (private blog networks)
- Comment spam
- Forum signature links
- Footer links across sites
- Mass directory submissions
- Buying links
- Reciprocal link exchanges
- Link wheels / pyramids

Measurement: focus on referring domains, not raw links. 1 link from NYTimes >> 100 from random blogs.`,
    tools: ["/link-building", "/tools/outreach-personalize", "/tools/backlink-discovery"],
  },

  // =================== Common mistakes / corrections ===================
  {
    id: "seo-folklore",
    title: "SEO folklore to ignore (2026)",
    tags: ["folklore", "myth", "wrong", "outdated", "deprecated", "mistakes"],
    body: `Things you'll see in old blog posts and r/SEO that are wrong:

- "Keyword density should be 2-3%" — Google has confirmed this isn't a thing. Write naturally.
- "Meta keywords tag matters" — Google hasn't used it in over a decade.
- "Submit to 100 directories" — harmful (looks like spam), not helpful.
- "Use only 1 H1" — outdated for HTML5; multiple H1s are fine if semantically appropriate.
- "Exact-match URLs are critical" — overrated. Descriptive slugs work fine.
- "Domain age affects rankings" — Google has explicitly denied this.
- "Bounce rate is a ranking signal" — Google said no, multiple times.
- "AMP is required" — deprecated entirely. Most large publishers ditched it.
- "Mobile-first means separate m. domain" — opposite. Responsive only.
- "FAQ schema on commercial pages produces rich results" — rolled back August 2023; only authoritative health / .gov get them now.
- "Buying links works if you're careful" — Google's 2024 spam updates cleaned out almost all sites doing this.
- "AI-generated content ranks fine" — Search Engine Land study: 8× less likely to rank #1 than human-edited content.`,
    tools: ["/knowledge"],
  },

  // =================== Tools-specific ===================
  {
    id: "wordpress-fixes",
    title: "WordPress-specific SEO fixes",
    tags: ["wordpress", "wp", "yoast", "rankmath", "all in one seo"],
    body: `Plugin choice (all free tier sufficient): RankMath (recommended — most features) or Yoast SEO. Don't run both.

Top wins on most WP sites:
- Audit active plugins: aim <15. Use Query Monitor to see which fire on every page. Replace bloat (Elementor → block themes).
- Caching plugin: WP Rocket (paid, best), LiteSpeed Cache (free, requires LiteSpeed server), W3 Total Cache (free, complex). Without caching, every page is regenerated per request.
- Image optimization: ShortPixel / Smush / EWWW. Convert to WebP. Lazy-load below the fold.
- Cloudflare in front: free tier, drops latency everywhere. Auto Minify + Brotli + Polish:Lossy.
- Hosting: shared hosting (Bluehost, GoDaddy) caps TTFB ~600ms+. Move to Kinsta / Cloudways / Hetzner if speed matters.
- Database: WP Optimize / WP Sweep monthly. Reduces overhead.
- Schema: built-in to RankMath / Yoast Premium. Validate post-edit.
- Internal linking: RankMath's Link Builder OR our /tools/auto-link.
- Headless option: WPGraphQL + Next.js for sites where speed is critical and content team needs WP UX.`,
    tools: ["/tools/auto-link", "/tools/local-cwv"],
  },
  {
    id: "shopify-fixes",
    title: "Shopify-specific SEO fixes",
    tags: ["shopify", "shopify seo", "ecommerce", "product page"],
    body: `Shopify hosts the store, so caching is handled. Speed problems come from apps, theme code, unoptimized product images.

Top wins:
- App audit (Settings → Apps): every app injects scripts. Audit + remove abandoned ones. Each one usually adds 200-800ms.
- Theme: Dawn or a fast paid theme. Old Sectioned themes (Debut) are slow. Page builders (Shogun, PageFly) are slow.
- Image compression: <100KB per product image. Shopify renders WebP automatically; just keep source files lean.
- Lazy-load with Liquid: change img_url to image_tag with loading: "lazy". Hero gets fetchpriority="high".
- Defer 3rd-party scripts (analytics, chat, reviews): load after page render.
- Faceted nav: canonicalize parameter URLs, Disallow tracking parameters in robots.txt.
- Product schema: Shopify default is decent; verify variant + offers + price are populated.
- Out-of-stock: don't 404. Keep the page with availability=OutOfStock + recommend alternatives.

Anti-patterns: Mega menus with 100+ links (kills crawl budget), separate URL per variant (canonicalize to parent product instead).`,
    tools: ["/tools/local-cwv", "/tools/ai-schema"],
  },
  {
    id: "nextjs-fixes",
    title: "Next.js / React SEO fixes",
    tags: ["nextjs", "next.js", "react", "spa", "javascript seo"],
    body: `Next.js is excellent for SEO when configured right.

App Router patterns:
- next/image with priority on the LCP image (hero). Width + height set.
- next/font for self-hosted fonts. Eliminates render-blocking external font request.
- next/script with strategy="afterInteractive" for analytics, chat, GTM.
- generateMetadata() for every route — title, description, openGraph, twitter, alternates.
- ISR or static rendering where possible. revalidate: 3600 on blog posts.
- Dynamic imports for client-only components below the fold.

Common pitfalls:
- "use client" everywhere — defeats RSC benefits. Use it only where needed (forms, interactivity).
- Loading state that delays content — kills LCP.
- Missing canonical when using both http + https or with trailing-slash routing.
- robots.txt + sitemap.xml not handled. Use route handlers (app/sitemap.ts, app/robots.ts).

Schema: emit via JSON-LD <script> in metadata or a server component. Validate on every deploy.

Hosting: Vercel / Netlify / Cloudflare Pages already at the edge. LCP becomes purely about asset weight + render path.`,
    tools: ["/tools/local-cwv", "/tools/render"],
  },

  // =================== International ===================
  {
    id: "international-seo",
    title: "International SEO — hreflang + ccTLD vs subdir vs subdomain",
    tags: [
      "international",
      "hreflang",
      "international seo",
      "country",
      "language",
      "cctld",
      "x-default",
    ],
    body: `Country/language strategy:
- ccTLD (example.de, example.fr): strongest geo signal, hardest to manage, splits link equity
- subdomain (de.example.com, fr.example.com): medium signal, easier hosting, link equity still split
- subdirectory (example.com/de/, example.com/fr/): weakest geo signal, easiest, link equity unified

Most modern sites use subdirectories — the hreflang annotations carry the geo-targeting signal, and unified link equity is more valuable than the geo signal.

hreflang rules:
- Every alternate must reference every other (reciprocity)
- Every page references itself (self-reference)
- Always include x-default for fallback
- Format: language-region (en-US, en-GB, fr-FR) — ISO 639-1 + ISO 3166-1
- Don't mix country and language: en-AU is fine; en alone is also fine; en-spanish is broken

Implementation: HTML head OR HTTP header OR sitemap. Pick one and stick with it. /tools/hreflang-gen emits all three formats.

Common bugs:
- Self-reference missing
- Reciprocal pair broken (page A says B but B doesn't say A)
- x-default missing
- Wrong language code (en_US instead of en-US)
- Conflicting canonical (canonical points to a different page than the hreflang group)`,
    tools: ["/tools/hreflang", "/tools/hreflang-gen"],
  },

  // =================== Reporting / measurement ===================
  {
    id: "gsc-vs-ga4",
    title: "GSC vs GA4 — why the numbers differ",
    tags: ["gsc", "search console", "ga4", "analytics", "metrics", "discrepancy", "reporting"],
    body: `Common confusion: GSC clicks ≠ GA4 organic sessions.

Why they differ:
- GSC measures Google-side: every click on your result. No bots / direct.
- GA4 measures site-side: every session that loaded a tracking pixel. Filters out bots; misses ad-blocked users (10-30% loss).
- GSC double-counts when same user clicks twice (back to SERP, click again).
- GA4 starts session timer on landing — multi-tab opens count as 1 session.
- Tracking gaps: privacy plugins, consent rejection, page-bounce-before-script-loads.

Typical relationship: GSC clicks ≈ GA4 organic sessions × 1.1-1.3.

Which to use for what:
- Rankings, queries, impressions, CTR → GSC
- On-site behavior, conversions, revenue → GA4
- Branded vs non-branded split → GSC (use brand-terms classifier)
- AIO citation tracking → GSC (look for clicks dropping while impressions stay flat — classic AIO pattern)

Branded queries inflate everything. Always split before reporting. 70%+ branded = the SEO isn't working; fewer than 30% = you have a brand problem.`,
    tools: ["/tools/branded-split", "/tools/traffic-drop", "/tools/gsc-coverage"],
  },
];

// =================== Retrieval ===================

/**
 * Match a user query to relevant knowledge chunks. Keyword + tag scoring,
 * no embeddings (deterministic, free, fast). Returns top-N most relevant.
 *
 * Trim threshold: skips chunks scoring zero so we never inject irrelevant
 * content (which would waste tokens).
 */
export function retrieveKnowledge(
  query: string,
  limit = 3,
): SeoKnowledgeChunk[] {
  const q = query.toLowerCase();
  const queryTokens = new Set(
    q
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );

  type Scored = { chunk: SeoKnowledgeChunk; score: number };
  const scored: Scored[] = [];

  for (const chunk of SEO_KNOWLEDGE) {
    let score = 0;
    // Tags are weighted highest — direct topic mapping
    for (const tag of chunk.tags) {
      if (q.includes(tag)) score += 5;
      else {
        // partial — token overlap with the tag
        for (const t of queryTokens) {
          if (tag.includes(t) || t.includes(tag)) score += 1;
        }
      }
    }
    // Title overlap
    const titleLower = chunk.title.toLowerCase();
    for (const t of queryTokens) {
      if (titleLower.includes(t)) score += 2;
    }
    // Body partial overlap (lighter weight)
    const bodyLower = chunk.body.toLowerCase();
    let bodyHits = 0;
    for (const t of queryTokens) {
      if (bodyLower.includes(t)) bodyHits += 1;
    }
    score += Math.min(3, bodyHits * 0.5);

    if (score > 0) scored.push({ chunk, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.chunk);
}

/**
 * Render the matched chunks as a compact context block for the system
 * prompt. Trims to a target token budget.
 */
export function renderKnowledgeContext(
  chunks: SeoKnowledgeChunk[],
  maxChars = 4000,
): string {
  if (chunks.length === 0) return "";
  const blocks = chunks.map(
    (c) => `### ${c.title}\n${c.body}${c.tools && c.tools.length > 0 ? `\nRelevant tools: ${c.tools.join(", ")}` : ""}`,
  );
  let out = blocks.join("\n\n");
  if (out.length > maxChars) {
    // Drop chunks until under budget
    while (blocks.length > 1 && out.length > maxChars) {
      blocks.pop();
      out = blocks.join("\n\n");
    }
    if (out.length > maxChars) out = out.slice(0, maxChars) + "...";
  }
  return out;
}
