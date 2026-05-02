# SEO Tool — Complete Project Context for Claude Code

This file gives Claude Code persistent context about this project. Read this completely before answering any question or making any changes. This is the source of truth — when in doubt, refer back to it.

---

## Part 1: What We're Building

An open-source, self-hostable SEO platform for freelancers, small agencies, and site owners who can't afford Semrush ($140-500/month) or Ahrefs (similar). Free-first: no paid APIs required to use core features. Modern, beginner-friendly, but powerful enough for professionals.

**Tagline:** "The integrated workflow OS for SEO freelancers — modern stack, truly free, no paid API keys required to get started."

**License:** AGPL-3.0 (same as Plausible, PostHog — prevents AWS-style cloning while staying open)

**Target users:**
- Freelance SEOs managing 1-15 clients
- Small agencies with 2-10 team members
- In-house SEOs at small-medium businesses
- Site owners doing their own SEO (beginners through intermediate)
- Pro/power users wanting self-hosted alternative to paid tools

---

## Part 2: Why This Exists (Competitive Analysis)

We studied every existing open-source SEO tool. Each has a critical limitation:

- **SEO Panel** (PHP, 2010+) — has client management, white-label reports, multi-user. But UI is dated, no modern automation, no niche-specific tasks, no AI features.
- **SerpBear** — excellent rank tracker, unlimited keywords, GSC integration, PWA mobile app, built-in SERP API, city-level tracking. But only does rank tracking. Costs ~$24/month for 1000 keywords via SERP APIs.
- **SEOnaut** (Go, MIT) — comprehensive site audit, severity classification, multi-user. But pure technical audit only.
- **OpenSEO** — modern Next.js, but only 3 stars on GitHub, requires DataForSEO ($50+ minimum) — not truly free.
- **RustySEO** — powerful all-in-one, log analysis, AI chatbot for audit data, local Ollama. But Rust desktop app, "actually technical" required, NOT recommended for non-technical marketers or agencies needing white-label.
- **Greenflare / LibreCrawl** — pure crawlers, no client/task/report layer.

**The gap we fill:** Integrated workflow (clients + tasks + audits + reports + AI) + truly free + modern UX + niche-aware automation + tech-stack-specific advice.

**What we explicitly do NOT try to be:**
- Better than Ahrefs/Semrush on data quality (lose this fight, save the money)
- A backlink index from scratch (use GSC + Ahrefs Webmaster Tools instead)
- Better than Screaming Frog at raw crawl depth (match basics, win on integration)
- Better than Surfer SEO at content scoring (match good-enough, win on integration)

**Existing features we absorb from each tool (parity table-stakes):**

From SEO Panel:
- Multi-client management with role-based permissions
- Directory submission management
- Proxy server management with auto-rotation
- Geo IP testing — see how site appears from different locations
- Social signals tracking (Facebook, Twitter, LinkedIn engagement)
- Review/reputation monitoring across platforms
- Activity log of all SEO activities with algorithm update timeline correlation
- Sitemap generator (XML, HTML, TEXT formats)
- Detailed user roles with custom permissions

From SerpBear:
- PWA mobile app
- Built-in public SERP API for user's own data
- Competitor rank tracking on same dashboard
- City-level rank tracking (not just country)
- Mobile vs desktop separate ranks
- Email digests with embedded ranking screenshots

From SEOnaut:
- Issue severity classification (critical/high/low) with explanation of impact
- Issue ignore/resolve workflow (mark as fixed, won't fix, false positive)
- Re-crawl single URL or section without full re-crawl
- Crawl history — diff between two crawls

From RustySEO:
- Server log file analysis (Nginx + Apache)
- Local AI chatbot for "ask questions about your audit data"
- Local Ollama integration for privacy
- CI/CD scriptable
- Image conversion and optimization (WebP, AVIF)

From Greenflare/LibreCrawl:
- Bypass robots.txt for staging environment audits
- Password-protected staging site crawling
- Custom user agents per crawl
- Multi-threaded crawling with concurrency control
- Crawl preset profiles

**Genuinely new things none of them have (our differentiators):**
1. Niche-specific auto-generated task templates
2. Browser extension for capturing data from external SEO tools
3. OCR + LLM screenshot parsing for client data
4. AI-generated executive summary using formula: [Direction] + [Win] + [Priority]
5. Automatic task generation from audit findings
6. GEO/AEO tracking (mentions in ChatGPT, Perplexity, Claude, Gemini)
7. Quick wins finder from GSC data (striking-distance keywords)
8. Content decay detector with recovery value scoring
9. Page change monitoring (alert on meta/H1/title changes)
10. SERP screenshot history
11. Manual data tracking (outreach, links built, comments) integrated
12. Client portal with magic-link access
13. Slack/Discord/Teams webhook digests

---

## Part 3: Core Design Principles (Non-Negotiable)

These principles override anything else when in conflict.

### 3.1 Free-first

- Use Google's free APIs (GSC, GA4, PageSpeed Insights, Mobile-Friendly Test, URL Inspection, Rich Results Test via GSC)
- Use free public endpoints (Google autocomplete at suggestqueries.google.com, People Also Ask scraping)
- Use headless browser automation (Playwright) for SERP scraping, rank checks
- Use open-source libraries that bundle locally (Wappalyzer, Tesseract.js, Lighthouse CI)
- Paid APIs are BYO key, optional, gated behind clear UX
- The tool must be fully usable without entering any API keys
- "Free" means no recurring costs to use core features, not "no setup required"

### 3.2 Tech-stack-aware

Every recommendation is layered:

- Layer 1 — Generic principle (everyone gets this)
- Layer 2 — Tech-specific cause (based on detected stack)
- Layer 3 — Tech-specific fix (exact steps for their stack)
- Layer 4 — Hosting-specific guidance (when relevant)
- Layer 5 — Plugin/theme-specific (when detected)

Detection runs in 2-3 seconds during initial site scan via Wappalyzer's open-source library + custom HTTP header/HTML signature/path probing/domain pattern checks.

Detected attributes stored: CMS, hosting provider, CDN, frontend framework, e-commerce platform, analytics tools, payment processors, marketing tools, language/runtime, theme, page builder.

Always show the user the detection result with "We detected X — is this right?" override option.

**Platform priority for v1:** WordPress, Shopify, Wix, Squarespace, custom PHP/Laravel, Next.js/React, Webflow.

**Platform priority for v2:** Drupal, Joomla, Magento/Adobe Commerce, BigCommerce, WooCommerce, Ghost, Hugo/Jekyll/Astro, SvelteKit, Nuxt, Django, Rails.

**Always honest about limitations:** "Wix has speed limitations you can't fully fix. Here's what's controllable."

### 3.3 Niche-aware

Auto-generate task lists based on niche. v1 niches:
- Local SEO (GBP optimization, citations, reviews, local landing pages)
- E-commerce (product schema, faceted nav, category optimization, image SEO at scale)
- SaaS / B2B (comparison pages, integration pages, programmatic SEO)
- Blog / Content
- Services / Professional

v2+ niches: News/Publisher, YouTube/Video, ASO, International/hreflang, Multi-location franchise, Migration, Penalty recovery, GEO/AEO.

### 3.4 Plain-language UX

- Never assume the user knows what a term means
- "Canonical tag" → "a signal to Google about the main version of this page when similar pages exist"
- Every technical term has a hover tooltip
- Every issue card has a "Why does this matter?" expandable section
- Every metric has a "What is this?" link
- One clear next action on every screen
- Sentence case everywhere, no Title Case, no ALL CAPS

**Two-mode interface:**
- Guided mode (default for new users) — walks through tasks one at a time with explanations, "Why this matters" expandable, expected impact shown, AI suggestions, plain language, hides advanced options
- Pro mode (toggle in settings) — dense data view, bulk actions, advanced filters, keyboard shortcuts, API access surfaced, technical detail without explanations

### 3.5 Close the loop

Don't just identify issues — fix them.

For platforms we integrate with:
- WordPress plugin (free, official directory) — read/write meta titles, descriptions, schema, redirects, robots.txt, sitemap, image alt texts
- Shopify app — edit product/collection/page meta, manage redirects, edit theme files, generate JSON-LD
- Wix app — manage SEO settings via Wix API
- Webflow integration — modify CMS items, SEO fields, 301 redirects via Webflow API
- CLI for developers — `npx seo-tool audit` for Next.js/custom sites, opens GitHub PRs

Always: preview before applying → save previous version → one-click undo → opt-out option.

For everything we can't auto-fix: generate exact code/instructions specific to their CMS, with copy-to-clipboard. Plus "give my developer instructions" button generating a clear ticket they can email/Slack.

### 3.6 Time-saving over feature-rich

The reporting reality: agencies managing 20 clients spend 120-160 hours monthly on manual reporting (nearly a full-time employee).

Goal: monthly client reporting goes from 6 hours to 25 minutes per client.

How: every data source flows into one unified time-series store. When user clicks "Generate Report," tool already has every number needed. Nothing to gather, only to render.

### 3.7 Follow Google's actual rules, not folklore

- Every recommendation cites Google's own documentation (link to it)
- Base advice on Google's confirmed ranking factors: helpful content, E-E-A-T, page experience, mobile-friendliness, Core Web Vitals, structured data, internal linking, content freshness
- Built-in "Google update tracker" pulls from Google's Search Status Dashboard

**Bad SEO advice that will NOT be in our tool:**
- "Keyword density should be 2-3%" (Google says this isn't a thing)
- "Meta keywords tag matters" (Google hasn't used this in over a decade)
- "Submit to 100 directories" (harmful, not helpful)
- "Use only 1 H1" (outdated, multiple H1s fine in HTML5)
- "Exact-match keywords in URLs" (overemphasized)

---

## Part 4: Tech Stack

- **Monorepo:** Turborepo with `apps/web`, `apps/api`, `apps/crawler`, `packages/shared`
- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Recharts/Tremor for charts, React Hook Form + Zod
- **Backend API:** Node.js with Fastify (or NestJS for more structure), TypeScript
- **Crawler service:** Python with FastAPI — Scrapy/httpx + lxml/BeautifulSoup for fast HTTP, Playwright for JS rendering
- **Database:** PostgreSQL with TimescaleDB extension (single database for self-hosting simplicity — replaced earlier ClickHouse plan because too heavy)
- **ORM:** Drizzle (lighter than Prisma, better for self-hosting — Prisma's binary engines are heavy)
- **Cache + queue:** Redis with BullMQ for background jobs
- **Auth:** Auth.js (NextAuth) or Lucia, with email/password + Google OAuth + magic links
- **Storage:** MinIO (self-hosted S3) for PDFs, screenshots, exports
- **Search:** Meilisearch for in-app search across clients/keywords/tasks
- **Browser automation:** Playwright in separate worker pool
- **Tech detection:** Wappalyzer open-source library (2,500+ technology fingerprints, MIT license)
- **OCR:** Tesseract.js (free, local) for English; PaddleOCR for multilingual
- **Local AI:** Ollama integration with Llama 3.2 / Phi-3 / Mistral for users who want it
- **PDF generation:** Puppeteer or Playwright server-side rendering of HTML reports
- **Self-host:** Docker Compose, single command bring-up
- **Monitoring (optional):** Sentry for errors, PostHog (self-hostable) for product analytics

**Self-hosting requirements:**
- Must run on $5/month VPS for small users (Hetzner CX11)
- No Kubernetes required for basic deployment
- Single `docker compose up -d` brings up entire stack: web, API, worker, Postgres, Redis, browser pool

---

## Part 5: Data Sources (All Free)

### Free Google APIs (official, no scraping)
- Google Search Console API — clicks, impressions, queries, pages, CTR, position
- Google Analytics Data API (GA4) — traffic, conversions, behavior
- PageSpeed Insights API — Core Web Vitals, Lighthouse scores (25,000 requests/day free)
- Google Business Profile API — local SEO data
- Bing Webmaster Tools API
- IndexNow API — submit URLs for indexing to Bing/Yandex
- Google Trends (unofficial via pytrends)
- Google URL Inspection (via GSC API) — replaces Rich Results Test for indexability

### Free keyword data
- Google autocomplete: `suggestqueries.google.com/complete/search?client=firefox&q=QUERY` returns JSON, no key needed, sub-second response, free forever (rotate IPs at scale)
- People Also Ask — scrape from SERP HTML
- Related Searches — scrape from SERP HTML
- Wikipedia API — entity research, topic clustering
- Reddit API (free tier) — niche keyword discovery
- YouTube Data API (10,000 units/day free) — video keyword research

### Free SERP/ranking data
- Browser-mode rank checking via headless Playwright (slow but free)
- DuckDuckGo HTML scraping (less protected than Google)
- Bing Web Search API (free tier)
- Searx/SearxNG instances (meta-search, scrape-friendly)

### Free crawler/technical data (own infrastructure)
- Own crawler (Scrapy, Crawlee, Playwright) — no external API needed
- Lighthouse CI (open-source) — full Lighthouse audits locally
- Mozilla Observatory API — security headers
- SSL Labs API — SSL/TLS analysis
- Common Crawl — massive free web crawl dataset, can extract backlinks
- Wappalyzer (open-source library) — tech stack detection

### Free backlink data (the hardest one)
- Common Crawl extraction (limited but free)
- GSC integration provides own site's backlinks (free)
- Ahrefs Webmaster Tools (free for verified site owners — recommend pairing)
- Be honest with users about backlink data limitations

### Free AI for content features
- Local Ollama with Llama 3.2 / Mistral / Phi-3 (runs on user's machine)
- Free OpenRouter tier
- BYO key for OpenAI/Anthropic if user wants

### Browser-mode operation (the killer free feature)
- Tool ships with embedded headless browser worker (Playwright)
- Users with no API keys still get full functionality, just slower
- API mode (if user adds free Google API key): fast, official data
- Browser mode (default): headless browser scrapes Google, DuckDuckGo, Bing for SERPs, autocomplete, related searches
- Hybrid: use browser for free data, free APIs for what they cover

---

## Part 6: Data Capture Mechanisms (6-Layer Architecture)

How data gets into the tool from external sources, in order of preference:

### Layer 1: Direct API integration (best, when free APIs exist)
- PageSpeed Insights, GSC, GA4, Mobile-Friendly, etc. — all run automatically on schedule
- User never opens external tool again — our tool has the data, fresher and historical

### Layer 2: URL-based fetch + parse
- For tools without APIs but with shareable result URLs
- Example: user pastes GTmetrix or WebPageTest URL, our tool fetches and parses

### Layer 3: Browser automation in background
- For tools without APIs at all
- Headless Playwright runs the test for the user
- Hit the tool's URL, fill form with target URL, scrape results
- Works for: Google Rich Results Test (legacy UI), PageSpeed UI, Schema validator, Bing webmaster tools, third-party tools without APIs

### Layer 4: Browser extension companion (v2)
- Chrome/Edge extension that pairs with web app
- User browses normally — opens PageSpeed Insights, runs test
- Extension detects result page, captures JSON, sends to tool
- User opens Search Console, looks at query — extension button "Send to my SEO tool"
- User on competitor's page — extension button "Add to competitor tracking"

### Layer 5: OCR/screenshot upload (v2 — major differentiator)
- For data user can't get any other way (paid tool screenshots, vendor reports, internal dashboards)
- User drags screenshot into tool
- OCR extracts text (Tesseract.js for English, PaddleOCR for multilingual)
- Local LLM (Ollama with Phi-3 or Llama 3.2 3B) parses extracted text into structured fields
- Vision model (LLaVA via Ollama, or Claude/GPT-4 Vision via BYO key) for chart values
- User confirms/edits parsed values
- Data lands in right place automatically

Example: Input image text "Organic Leads This Month: 47 / Last Month: 31 / Conversion Rate: 3.2%" — LLM extracts metric: "Organic Leads", current: 47, previous: 31, change: +51.6%

### Layer 6: CSV/Excel import + Google Sheets sync
- SEOs live in spreadsheets — native CSV import for everything
- Google Sheets two-way sync for users who want to keep their workflow

---

## Part 7: Tool Hierarchy (14 Sections)

### 1. Workspace Shell
Outer chrome present on every page:
- Top bar: logo, client switcher dropdown, search across everything, notifications bell, user menu, mode toggle (Guided/Pro)
- Left sidebar: main navigation, collapsible per section
- Right sidebar (collapsible): quick actions — Run audit, Add keyword, Generate report, Ask the tool
- Settings area: account, team, billing, integrations, API keys, white-label branding, notifications, language, theme
- Help layer: floating help button, opens chat with AI assistant

### 2. Client Dashboard (per-client home)
- Greeting strip: "Good morning, [name]. Here's what needs attention on [site] today."
- Health score card: 0-100 score, week-over-week trend
- Top 3 metrics: visitors from Google, keywords ranking, tasks done this week
- Today's priority list: 3-5 things sorted by impact, with time-to-fix estimates
- "What changed since you were last here" feed
- Quick wins panel: striking-distance keywords, content decay candidates, lost backlinks
- Recent activity feed
- Upcoming this week/month

### 3. Tasks Section
- Today / This week / This month views
- All tasks (Kanban + List)
- Templates library (by niche, by tech stack)
- Recurring tasks scheduler
- Task detail view: why it matters, expected impact, steps, related URLs, notes, comments, attachments, time tracked, completion log

Task properties: title, description (plain language), why-it-matters (Google citation), priority, frequency, niche tags, tech-stack tags, assigned to, due date, status, time estimate, related URLs, related keywords, fix wizard available (yes/no), CMS-direct-fix available (yes/no).

### 4. Audits Section
- Latest audit overview: score, issue count by severity, quick stats
- Issues list: grouped by severity (critical/high/medium/low), filterable by type/page/status (new/resolved/ignored/false-positive)
- Audit history: every past audit, diff view between two
- Run new audit: full crawl, single URL, specific section, scheduled
- Crawl settings: depth, follow rules, user agent, exclude patterns, JS rendering, password-protected staging
- Issue detail: deep view per issue type with explanation, all affected URLs, fix wizard, link to Google docs

**Specific audit modules:**
- Page speed (Core Web Vitals via PageSpeed Insights)
- Mobile-friendliness
- Schema validation
- Meta tags audit
- Internal linking analysis
- Image optimization
- Robots.txt and sitemap
- HTTPS / SSL audit
- Hreflang validator
- Security headers audit
- Indexability check
- Content quality scan (duplicate, thin)
- JavaScript rendering check
- Server log analysis (if logs uploaded)

### 5. Keywords Section
- Keyword research: input seed, get suggestions from autocomplete + PAA + Reddit + YouTube + Wikipedia
- Tracked keywords: sortable table with current rank, change, trend chart, mobile vs desktop, location
- Rank tracker dashboard: all tracked keywords over time
- Keyword clusters: auto-grouped by topic and intent
- Quick wins finder: striking-distance keywords (positions 4-15)
- Keyword cannibalization: detect conflicts where multiple pages compete for same query
- SERP analysis: top 10, SERP features, AI Overview presence, your position vs competitors
- Search intent classifier: informational/navigational/transactional/commercial
- Keyword import/export (CSV, Google Sheets)
- Keyword history with annotations on key dates

### 6. Content Section
- Content calendar (month/week views)
- Content briefs generator: target length, headings, semantic keywords, PAA questions, competitor analysis, internal linking suggestions
- Content score: real-time SEO score in editor or via paste/import
- Content gap analysis: topics competitors cover that you don't
- Content decay detector: pages losing traffic, prioritized by recovery value, with refresh briefs
- Topic cluster builder: visual map of clusters and pillar pages
- Editorial workflow: idea → outline → draft → review → published
- Content templates library: how-to, listicle, comparison, ultimate guide, case study
- AI assistant for content: rewrite, expand, generate titles, optimize paragraphs (local Ollama or BYO key)
- Plagiarism + AI detection check before publishing
- Image generation for content (local Stable Diffusion or BYO key)

### 7. Backlinks Section
- Backlink profile (limited free data + GSC backlinks for verified sites)
- New backlinks earned this period
- Lost backlinks with recovery priority
- Toxic links flagging (heuristic-based)
- Disavow file generator
- Outreach hub: prospects, templates, sent, replied, won
- Link opportunities: competitor backlinks they have that you don't
- Broken link building: find broken pages on other sites linking to your topic

### 8. Competitors Section
- Competitor list (auto-detected + manually added)
- Competitor SERP overlap: keywords they rank for that you do/don't
- Competitor content tracker: what they published recently
- Competitor backlink delta: new links they earned
- Competitor change monitoring: alert when they update key pages
- SERP head-to-head: side-by-side analysis for any keyword
- Domain authority comparison (using free metrics)
- Share of voice: % of tracked keyword visibility belonging to you vs competitors

### 9. AI Visibility Section (the 2026 differentiator)

Critical context: Google's AI Overviews now appear on 47% of commercial queries. Gartner projects 25% organic traffic drop by 2028. Reddit appears in 40.11% of LLM citations. Perplexity matches Google's top 10 in 91% of cases.

Features:
- LLM mention tracker: weekly checks across ChatGPT, Perplexity, Claude, Gemini, AI Overviews for tracked queries
- Citation analysis: when not cited, who is (Reddit, Wikipedia, industry pubs)
- Reddit monitoring: brand and competitor mentions, opportunity threads
- AI bot crawl tracking from server logs (GPTBot, ClaudeBot, PerplexityBot frequency)
- llms.txt manager: generate, validate, monitor (controversial new web standard)
- Robots.txt AI bot policy: decide which AI bots to allow/block, generate updated robots.txt
- AI Overview presence: which queries show AIO, are you cited
- Optimization suggestions: chunkable content, factual structure, citation-worthy formatting

### 10. Local SEO Section (only shown if niche = Local)
- Google Business Profile manager (direct GBP API integration)
- Review hub: aggregate from Google, Yelp, TripAdvisor, Trustpilot, Facebook
- Citation tracker: 50+ niche directories, NAP consistency checker
- Local rank tracker: by physical location within city, with map view
- Local pack visibility: 3-pack tracking
- Service area pages: generator for multi-location businesses
- Local schema templates by business type (Restaurant, Lawyer, Plumber, Dentist)
- Photos manager: upload, schedule GBP photos
- GBP posts scheduler

### 11. Reports Section (the time saver)
- Reports library
- Generate new report (pick client, period, template)
- Report builder: drag-and-drop sections, custom branding, white-label
- Report templates: Executive, Detailed, Technical, Local, E-commerce, Custom
- Scheduled reports
- Client portal with magic link access (clients see live progress without PDF)

**Standard report sections:**
1. Executive Summary (AI-generated using formula: [Direction] + [Win] + [Priority]. Example: "Organic traffic increased 18% this month, driven by ranking improvements on commercial keywords. Next month we'll focus on capturing competitor content gaps.")
2. Performance Highlights / Wins
3. Organic Traffic Analysis (GSC + GA4)
4. Keyword Rankings & Visibility
5. Top Pages by Traffic / Conversions
6. Technical Health Status
7. Backlinks Update (new/lost)
8. Competitor Analysis
9. Content Performance
10. AI Visibility (LLM citations, AI Overview presence)
11. Conversions & Revenue Attribution (v2)
12. Work Completed This Month (auto-populated from tasks)
13. Manual Data Inputs (outreach, links built, comments — user-logged with screenshot proof)
14. Recommendations / Next Month's Priorities

**Stakeholder report variants:** same data, different audiences. CEO sees revenue and ROI. CMO sees traffic and pipeline. CTO sees technical health. Junior marketer sees what's been done.

### 12. Integrations Section
**Free OAuth integrations (v1):**
- Google Search Console
- Google Analytics 4
- Google Business Profile
- Bing Webmaster Tools

**CMS plugins (v1: WordPress; v2: Shopify, Wix, Webflow):**
- WordPress: free plugin in official directory
- Shopify: free app in App Store

**CRM integrations (v2 — for revenue attribution):**
- HubSpot (priority)
- Pipedrive
- Salesforce
- Zoho

**Notifications (v1: Slack; v2: Discord, Teams):**
- Slack webhook
- Discord webhook
- Microsoft Teams webhook
- Email (SMTP)

**Developer integrations (v2-v3):**
- GitHub / GitLab (PR-based fixes)
- Google Sheets (two-way sync)
- Notion / Airtable (content calendar sync)
- Zapier / Make / n8n (generic webhooks)

**BYO key integrations (optional):**
- DataForSEO / SerpAPI (advanced SERP features)
- OpenAI / Anthropic (AI features beyond local Ollama)

### 13. Automations Section (v2)
- Workflow builder: drag-and-drop, trigger → conditions → actions (n8n/Zapier-style)
- Workflow templates: pre-built common patterns
- Active workflows: list with run history, edit, pause
- Notification rules
- Scheduled jobs: recurring audits, scheduled reports, recurring task creation
- Webhook endpoints (incoming and outgoing)
- Custom monitors: page change monitoring, SERP feature changes, brand mention alerts

**Pre-built workflow templates:**
- "When key page drops below position 10, alert me on Slack and create content refresh task"
- "When new article is published, automatically check it for SEO issues and assign fixes"
- "When backlink is lost from high-authority domain, draft outreach email to recover"
- "Every Friday, email me one-page summary of all client progress"
- "When competitor publishes new content on tracked topics, log it and notify me"

### 14. Learn Section
- SEO basics course: short interactive lessons (3-5 min each):
  - What is SEO? (3 min)
  - How Google decides who ranks (4 min)
  - The 5 things that matter most (5 min)
  - What's a keyword? (2 min)
  - What's a backlink? (3 min)
  - Reading your dashboard (2 min)
- Glossary: every term explained in plain language (with hover tooltips throughout app)
- Tech stack guides: platform-specific guides for WordPress, Shopify, Next.js, etc.
- Video walkthroughs
- Best practices library: Google's actual documentation, summarized
- Algorithm update tracker: Google's Search Status Dashboard with impact analysis
- Community forum
- Roadmap voting
- Changelog

---

## Part 8: User Workflows (Three Personas)

### Persona 1: Priya (freelance SEO with 5 clients — typical user)

**Onboarding (8 minutes):**
1. Visits marketing site, sees "Audit any website free in 60 seconds"
2. Pastes URL — tool runs audit publicly without signup
3. After 90 seconds: sees health score, issues, ranking keywords, competitors, tech stack
4. "Save this audit" → creates account (no credit card)
5. Adds 4 more clients in bulk
6. Connects GSC + GA4 (one OAuth click)
7. Tool creates initial monthly task lists per client based on niche + tech stack

**Daily flow:**
1. Opens tool, sees morning briefing across all 5 clients
2. Clicks most urgent client, sees today's priority list
3. Taps task, opens detail view with wizard
4. Reviews/edits AI suggestions, clicks Apply
5. WordPress plugin updates site in seconds
6. Audit re-runs that section, confirms resolved
7. Continues across all clients
8. By 11 AM: 12 tasks completed across 5 clients

**End of month:**
1. Tool notification: "Monthly reports ready to review for all 5 clients"
2. Opens each report — fully populated with data, AI exec summary, work completed, manual inputs, recommendations
3. Reviews, edits exec summary, adjusts chart, adds personal note
4. Sends to client via tool
5. Total time: 25 minutes for all 5 clients (was 30 hours)

### Persona 2: Rajesh (complete beginner with one site)

**Onboarding:**
1. Pastes URL of his Shopify soap business
2. Sees: 41/100 health score, 89 issues, "not ranking for 12 keywords competitors rank for"
3. Tech stack detected: Shopify, Dawn theme
4. Signs up, picks "I'm new to SEO"
5. Tool switches to Guided Mode automatically
6. Friendly dashboard: "Welcome Rajesh! SEO can feel overwhelming, but we'll go step by step. Your site has some catching up to do, but everything we found is fixable. Let's start with the 3 most impactful things."

**First fix:**
1. Task: "Your homepage title is too long" (102 chars)
2. Wizard explains why long titles get cut off, shows AI alternatives, live Google preview
3. Picks one, clicks Apply — Shopify app updates in 3 seconds
4. Tool celebrates: "First fix done! See how your search result will now look much cleaner. This single change can improve click-through rates by up to 15%."

**30 days later:**
- Fixed 47 of 89 issues
- Understands titles, meta descriptions, alt text, schema, internal linking
- Health score: 78/100
- Ranking for 14 new keywords
- Traffic up 340%
- First monthly summary in plain language: "This month, you fixed your title tags, added descriptions to 47 pages, and improved your site speed. Google is starting to notice — your site appeared in search 12,000 times this month, up from 3,500 last month."

### Persona 3: Agency team of 4 (power users)

**Setup:**
- Owner creates workspace, invites 3 team members with roles
- Adds 18 client websites in bulk via CSV
- Connects GSC, GA4, GBP per client
- Tags clients with niches (3 local, 8 e-commerce, 4 SaaS, 3 services)
- Sets up CMS plugins per client
- Connects HubSpot for 8 clients (revenue attribution)
- Sets up white-label branding (agency logo, colors, custom domain for client portal)
- Creates client portals, sends magic links

**Daily flow:**
- Owner sees aggregated view across 18 clients — alerts, ranking changes, urgent tasks
- Bulk-assigns today's tasks to team
- Junior team member sees only her assigned clients (auto-prioritized)
- Senior member uses Pro Mode with custom dashboards
- Owner uses Capacity view to see who's overbooked

**Reporting day:**
- Clicks "Generate all reports" — processes 18 clients in parallel, ready in 4 minutes
- Reviews each (2-3 min per report)
- 8 reports include revenue attribution: "This month, organic search drove 47 leads with $124,000 in tracked pipeline. 12 deals closed-won, $32,000 in revenue."
- Schedules all to send Tuesday 9 AM via email

**Result:** Same team handles 18 clients (was 12) with no burnout. Monthly reporting went from 80 hours to 6 hours.

---

## Part 9: SEO Daily Workflow (What the Tool Automates)

Real SEO executive's day, mapped to tool features:

### Morning health check (15-30 min) — tool automates entirely
- GSC sudden drops → auto-alert
- Coverage/Pages errors → auto-alert
- Manual Actions and Security Issues → auto-alert
- GA4 yesterday's organic traffic vs week-ago → in dashboard
- Uptime monitoring → auto
- Rank tracker drops >5 positions → auto-alert
- Google Search Status Dashboard → auto-track
- SEO news skim → in-tool curated feed (Search Engine Land, SEO Roundtable)

### Mid-morning client work (1-2 hours per client)
- Yesterday's published content indexing check → auto
- Competitor SERP movement → in-tool dashboard
- Spot-check key landing pages → automated audits
- Targeted audits (single section) → user-triggered

### Active work block (rotates by day)
- Monday: weekly keyword research, SERP analysis
- Tuesday: on-page optimization (rewriting titles/metas, improving thin content)
- Wednesday: technical SEO fixes (schema, internal linking, redirect chains)
- Thursday: link building / outreach / digital PR
- Friday: content briefs, content review, calendar planning

### End of day (30 min)
- Log what was done → auto-tracked via task completion
- Note tomorrow's priorities → auto-suggested
- Update editorial calendar → in content section
- Schedule social/content distribution → integrations

### Weekly tasks (one day a week)
- Full broken-link scan → auto-scheduled
- Competitor backlink delta → auto
- Review GSC week-over-week → in dashboard
- Update keyword tracking list → in keywords section
- Internal linking audit on week's published content → auto
- Check for keyword cannibalization → auto-detect

### Monthly tasks
- Full site crawl and audit → scheduled
- Backlink profile review → in backlinks section
- Content performance review → in content section
- Competitor content analysis → in competitors section
- Algorithm impact assessment → auto-correlated
- Monthly client report → one-click generate
- Plan next month's content calendar → in content section

### Quarterly tasks
- Strategy review against goals
- Topical authority/topic cluster review
- Tech stack and tool review
- Set next quarter's OKRs

---

## Part 10: Tech-Specific Recommendation Examples

When tool detects WordPress + Astra theme + SiteGround, page speed issue produces:

> Speed up your WordPress site
> We detected 23 plugins active. Biggest WordPress slowdowns: plugins, images, missing caching.
> 1. Install WP Rocket or free LiteSpeed Cache for caching
> 2. Enable SiteGround's built-in caching (Site Tools → Speed)
> 3. Replace 12 images with WebP using ShortPixel plugin
> 4. Deactivate 4 unused plugins we identified
> 5. In Astra theme settings, enable "Defer JS"

Same issue on Shopify + Dawn theme produces:

> Speed up your Shopify store
> Shopify hosts your store, so caching is handled. Speed problems usually come from apps, theme code, unoptimized product images.
> 1. Audit apps in Settings → Apps — found 3 abandoned apps still loading scripts
> 2. Compress 47 product images (Shopify recommends max 100KB)
> 3. Remove unused Klaviyo embed from theme.liquid (line 47)
> 4. Switch to lazy-loaded format: change img_url to image_tag with lazy loading
> 5. Disable currency converter app (adds 800ms)

Same issue on Next.js 14 + Vercel produces:

> Speed up your Next.js site
> Next.js gives you control. Biggest wins: image optimization, bundle splitting, caching strategy.
> 1. Replace `<img>` with `next/image` on 8 detected pages
> 2. Add `priority` prop to LCP image on homepage
> 3. Move analytics scripts to `next/script` with strategy="afterInteractive"
> 4. Enable ISR with `revalidate: 3600` on blog routes
> 5. Preload critical font in app layout with `next/font`

**Knowledge base structure** for this (community-contributable YAML/markdown):

```yaml
issue: page_speed_too_slow
  generic_explanation: "Slow pages hurt rankings and conversions..."
  generic_target: "LCP under 2.5s, FID under 100ms, CLS under 0.1"
  
  platforms:
    wordpress:
      common_causes: [too many plugins, no caching, large images, no CDN]
      tools:
        caching: [WP Rocket, LiteSpeed Cache, W3 Total Cache]
        images: [ShortPixel, Smush, EWWW, Imagify]
        cdn: [Cloudflare free, BunnyCDN, KeyCDN]
      step_by_step: [...]
      hosting_overrides:
        siteground: "Use SG Optimizer instead — pre-installed"
        kinsta: "Caching built-in, focus on images and code"
        wpengine: "EverCache built-in, configure exclusions"
        bluehost: "Generally slow, consider migrating"
    shopify: [...]
    nextjs: [...]
    laravel: [...]
    wix:
      honest_note: "Wix has speed limitations you can't fully fix. Focus on what's controllable."
```

This pattern repeats for every issue type (schema markup, sitemap, redirects, image optimization, internal linking, etc.).

---

## Part 11: Database Schema (High-Level)

Key tables (TimescaleDB hypertables for time-series):

- `users` — accounts
- `workspaces` — top-level tenant boundary
- `workspace_members` — user-workspace links with roles (owner, admin, editor, viewer)
- `clients` — websites managed in a workspace, with niche tag and detected tech stack
- `client_integrations` — GSC, GA4, GBP, CMS connections per client
- `tech_stack` — detected technologies per client
- `tasks` — task instances assigned to a client
- `task_templates` — reusable templates by niche/frequency/tech-stack
- `task_completions` — log of completed tasks (for reports)
- `audits` — audit runs per client
- `audit_issues` — issues found with severity, status (new/resolved/ignored/false-positive)
- `keywords` — tracked keywords per client
- `keyword_rankings` — time-series rank data (TimescaleDB hypertable)
- `keyword_research_results` — saved research outputs
- `keyword_clusters` — keyword groupings
- `competitors` — tracked competitors per client
- `backlinks` — known backlinks per client (limited free data)
- `pages` — tracked pages per client (for change monitoring)
- `page_changes` — log of detected meta/H1/title changes
- `reports` — generated reports per client
- `report_templates` — customizable report templates
- `manual_data_inputs` — user-logged outreach, links built, comments, etc.
- `notifications` — alerts and notifications
- `activity_log` — who did what when (for agencies)
- `ai_visibility_checks` — LLM mention tracking (v2)
- `crm_attributions` — revenue attribution data (v2)

Multi-tenancy: every query scoped to workspace via middleware. Non-negotiable.

---

## Part 12: Build Roadmap

### v1 scope (12 weeks) — what ships first

1. Multi-client/workspace management with multi-tenancy
2. Tech stack auto-detection on signup
3. Niche-aware task templates (5 niches: Local, E-commerce, SaaS, Blog, Services)
4. Site crawler with the 30 core audit checks
5. Google Search Console + Google Analytics 4 OAuth integrations
6. Browser-mode rank tracking (50 keywords/client free)
7. Keyword research via Google autocomplete + People Also Ask
8. White-label PDF reports with AI-generated executive summary
9. WordPress plugin (basic — apply title/meta/alt fixes via REST API)
10. Slack webhook for alerts
11. Client dashboard with priority list and health score
12. "Fix it for me" wizards for top 10 issue types
13. Plain-language UI with hover explanations
14. Onboarding flow with instant value (audit before signup)
15. Free public site grader landing page
16. Self-host via single docker-compose

### Week-by-week (12 weeks for solo developer with Claude Code, halve for team of 2)

**Weeks 1-2: Foundation**
- Monorepo setup (Turborepo)
- Database schema + migrations (Postgres + Drizzle)
- Auth system (Auth.js with email/password + Google OAuth)
- Multi-tenancy middleware
- Basic UI shell with theme + dark mode
- Docker compose setup
- CI/CD (GitHub Actions)
- Public marketing site landing page

**Weeks 3-4: Crawler and audits**
- Python crawler service (Scrapy-based)
- 30 core audit checks (broken links, meta, headers, schema, images, redirects, etc.)
- Tech stack detection via Wappalyzer
- Audit storage and history
- Issue severity classification with explanations
- Initial audit on every new client

**Weeks 5-6: Integrations**
- Google Search Console OAuth and data sync
- Google Analytics 4 OAuth and data sync
- PageSpeed Insights API integration
- Niche detection logic (analyze content + GSC queries)
- Google autocomplete keyword research
- People Also Ask scraping

**Weeks 7-8: Tasks system**
- Task data model and CRUD
- Niche-aware template library (5 niches)
- Tech-stack-aware overrides (WordPress, Shopify, Next.js, generic, Wix)
- Auto-task generation from audit findings
- Task assignment, status, comments
- Recurring task scheduler
- Daily/weekly/monthly task views

**Weeks 9-10: Rank tracking and dashboard**
- Headless browser rank tracker (Playwright)
- Daily ranking schedule via BullMQ + Redis
- Mobile vs desktop tracking
- Rank history charts
- Client dashboard with priority list, health score, alerts
- "Today" view assembling tasks from all clients
- "What changed" feed

**Weeks 11-12: Reports and polish**
- Report builder with template system
- AI executive summary (local Ollama or BYO key)
- White-label branding
- PDF generation (Puppeteer)
- Scheduled report delivery via email
- Client portal magic links
- WordPress plugin (basic — title/meta/alt fixes via REST API)
- Slack webhook
- Free public site grader page
- Documentation site
- Onboarding flow polish
- Bug fixes and final QA

**Week 13: Beta launch**
- Invite 25 beta users from validation pool
- Iterate based on feedback for 2-3 weeks
- Public launch on Product Hunt, Hacker News, r/SEO

### v2 (months 4-9)
- AI search visibility tracking (LLM citations)
- CRM integrations (HubSpot first) for revenue attribution
- Revenue per page reporting
- Content brief generator and content score
- Content calendar
- Shopify app
- Local SEO suite (GBP manager, citations, reviews)
- OCR screenshot upload with LLM parsing
- Workflow automation builder
- Browser extension
- Quick wins finder
- Content decay detector
- llms.txt management
- AI bot tracking from logs
- Page change monitoring
- Mobile PWA
- Backlink tracking
- Competitor SERP overlap
- Schema generator

### v3 (months 10-18)
- Programmatic SEO toolkit
- International / hreflang manager
- Multi-touch attribution
- Stakeholder report variants
- Server log analysis
- Native mobile apps
- Plagiarism + AI detection
- Image generation
- Webflow / Squarespace / Wix integrations
- Public API
- Custom dashboards
- Annotations on charts
- Audit logs
- Team management
- Capacity planning
- Proposal generator
- Meeting notes integration
- Voice-to-task
- GitHub PR generation
- Plugin marketplace

### Explicitly out of scope
- Building our own backlink index (use GSC + Ahrefs Webmaster Tools)
- Competing with Screaming Frog on raw crawl depth
- Custom AI model training
- Mobile native apps before PWA
- Enterprise features (SSO, SAML, custom contracts)

---

## Part 13: Coding Conventions

- TypeScript strict mode everywhere
- ES modules, no CommonJS
- Prettier + ESLint with project config
- All API routes use Zod for input validation
- All database queries scoped to workspace via middleware (multi-tenancy non-negotiable)
- Errors return structured JSON, never strings
- All user-facing text supports i18n from day one (even if only English at launch)
- Components in lowercase-kebab.tsx files, exports use PascalCase
- Tests with Vitest for unit, Playwright for E2E
- Conventional Commits for git
- Sentence case in UI everywhere — never Title Case, never ALL CAPS

---

## Part 14: Critical UX Patterns

### Onboarding ("first 5 minutes decide everything")
1. Single field on clean page: "What's your website?" — no signup, no plan picker
2. While waiting 30-60 sec, show what tool is doing in plain English
3. Reveal personalized report: 47 things to look at, 23 keywords ranking, top 3 competitors, expected impact of fixes
4. Connect Google (optional but encouraged) — one-click OAuth, skip is fine
5. Pick goal: Get more visitors / Improve rankings / Fix technical issues / Manage clients

Value before asking for anything.

### "Fix it for me" wizard pattern
For top 10 issue types in v1, provide a wizard:
1. Show current state with explanation
2. Show why it's wrong (with character count, validation, etc.)
3. Show AI-generated suggestions (3 options)
4. Allow user to write custom
5. Show live preview of result (e.g., Google search result preview)
6. One-click Apply via CMS plugin
7. Re-run audit to confirm fix
8. Log action with timestamp for monthly report

### "Why does this matter?" pattern
Every issue, every recommendation has:
- Plain-language explanation of what the issue is
- Why it affects rankings
- Link to Google's actual documentation
- What'll happen when fixed
- Confidence level: "Definitely fix this" / "Probably worth fixing" / "Worth testing"

### External tool linking pattern
For tools we don't run:
- "Test this in Google's Mobile-Friendly Test" → opens with URL pre-filled
- "Check in Google's Rich Results Test" → opens pre-filled
- "Inspect in Google Search Console" → deep link to GSC URL inspection
- When user returns: "Did you fix it?" prompt, re-runs our check automatically

### Error/panic prevention pattern
- Never just show red without context
- "Your traffic dropped 12% — but it's a holiday week, this is normal. Last year was similar."
- Annotations on charts for known events (algorithm updates, holidays)

### Educational integration
- Underline every technical term once per screen with dotted underline
- Hover for plain explanation
- Click for deeper Learn lesson
- Real-world examples on every concept (before/after Google search results, etc.)

### "Ask the tool" AI assistant
- Chat box where users ask in plain English: "Why did my traffic drop?" or "What should I do about my e-commerce category pages?"
- Tool uses user's data + LLM to answer with their specific context
- Local Ollama integration so this works free, privately

### Quick patterns to include
- Smart change detection on important pages → alert when meta/H1/title changes
- Activity log per page → timeline of all changes with traffic correlation
- SERP screenshot history → visual evidence of feature changes
- Comment on anything → notes on tasks, pages, keywords, audit findings
- Quick wins finder → striking-distance keywords, near-CTR-threshold pages
- Content decay detector → pages losing traffic ranked by recovery value
- Client portal magic-link → clients see live progress without PDF
- Email digest builder → Monday morning agency owner digest
- Templates for everything (outreach, content briefs, dev tickets, client emails)
- Side-by-side competitor view with actual screenshots
- Undo for everything tool does via CMS plugins (one-click reversible)
- Progress celebration (badges, animations when score improves, streak tracking)
- "I'm stuck" button on every screen → opens AI chat with context

---

## Part 15: Marketing & Acquisition Strategy

### Free public tools (drives signups)
Host as separate landing pages on marketing site, no signup required:
- Free site grader (paste URL, get instant audit)
- SERP simulator
- Schema generator
- Robots.txt validator
- Hreflang checker
- Meta tag generator
- Title/description preview tool
- Schema.org structured data generator
- Sitemap generator/validator

Each ranks for SEO-related queries, drives top-of-funnel.

### Content marketing
- Built-in Learn section content also published as public blog
- "Why we built this" post (founder story)
- "Why open-source SEO matters" post
- Comparisons: vs Semrush, vs Ahrefs, vs SEO Panel
- How-to guides per niche
- Case studies from beta users

### Community building
- GitHub repo with clear README, roadmap, contribution guide, code of conduct
- Public roadmap with voting
- Slack/Discord community
- "Build in public" on Twitter/LinkedIn from day one
- Respond to every issue/PR fast
- First 3-5 contributors are critical — recruit them deliberately

### Launch sequence
- Beta with 25 users (from validation outreach pool)
- Iterate for 2-3 weeks
- Public launch on Product Hunt, Hacker News, r/SEO, IndieHackers
- Reach out to SEO newsletter authors for coverage

### Validation first (before any code)
- Reach out to 15-20 working SEOs (Reddit r/SEO, LinkedIn, network)
- Ask: "Would you use this? What's missing? What would make you actually switch from your current tools?"
- Find 5 who commit to being beta users
- This single step prevents 80% of failed product launches

---

## Part 16: Important Constraints & Anti-Patterns

### Constraints
- No paid APIs in core paths (gate behind BYO key with clear UX)
- No surveillance — no PostHog/Mixpanel by default (opt-in only)
- Privacy-first: all data stays on self-hosted instance
- Must run on $5/month VPS for small users (Hetzner CX11)
- Mobile-first responsive design (most SEOs check rankings on phone)
- Dark mode mandatory
- Accessibility: WCAG AA minimum

### Anti-patterns to avoid
- Don't try to compete with Ahrefs/Semrush on data quality
- Don't build features requiring constant API costs to operate
- Don't add complex enterprise features (SSO, SAML) before core works
- Don't write generic advice — always tailor to detected tech stack
- Don't make users configure 5 things before showing value
- Don't ship vanity metrics — every dashboard number must be actionable
- Don't over-scope MVP. Start narrower than instinct says
- Don't over-promise on backlink data quality (be honest about limits)

### Honest limitations to acknowledge
- Backlink data is hard — even paid tools have decade-old indexes
- SERP data has limits — heavy daily rank tracking on hundreds of keywords needs paid SERP API for production
- AI features depend on local resources or BYO API keys
- Some platforms (Wix, Squarespace) have inherent SEO limitations
- Detection isn't perfect — always show user the result, allow override

---

## Part 17: How to Work With Me (User)

When I ask you to build something:

1. Always use `/plan` mode for anything touching more than 2 files
2. Confirm the plan before implementing
3. Build incrementally — small, testable chunks
4. Write tests as we go
5. Commit after each working feature with conventional commit message
6. Ask clarifying questions if requirements unclear
7. Reference this CLAUDE.md when making architecture decisions
8. If you find yourself fighting the architecture defined here, stop and ask
9. Maintain DECISIONS.md logging major architectural choices and rationale
10. Read this file completely before answering questions about the project

---

## Part 18: Decision Log

This section gets updated as we make architectural decisions during build.

Initial decisions made during planning phase (April 2026):

1. **Database: Single PostgreSQL with TimescaleDB extension** — rejected ClickHouse (too heavy for self-hosters), rejected separate time-series DB (adds operational complexity)
2. **ORM: Drizzle** — rejected Prisma due to heavy binary engines for self-hosters
3. **Crawler: Separate Python service** — Python's ecosystem (Scrapy, lxml, BeautifulSoup, advertools) unbeatable for SEO crawling
4. **License: AGPL-3.0** — same as Plausible/PostHog, prevents AWS-style cloning
5. **Monorepo: Turborepo** — best DX for our scale
6. **Browser mode default, API mode optional** — true free-first
7. **WordPress plugin first, Shopify second** — WordPress is 43% of all sites
8. **5 niches in v1** — Local, E-commerce, SaaS, Blog, Services
9. **Free public site grader as marketing channel** — proven pattern (Ahrefs, Semrush use this)
10. **AI features via local Ollama or BYO key** — keeps it free for users without forcing API costs

---

## Part 19: Reference Material

### Free APIs we rely on (full list)
- Google Search Console API
- Google Analytics Data API (GA4)
- Google PageSpeed Insights API (25k requests/day free)
- Google Mobile-Friendly Test API
- Google Rich Results Test (via GSC URL Inspection)
- Google URL Inspection API (via GSC)
- Google Business Profile API
- Bing Webmaster Tools API
- IndexNow API
- Google Trends (via pytrends)
- Google autocomplete (suggestqueries.google.com — public endpoint)
- Wikipedia API
- Reddit API (free tier)
- YouTube Data API (10k units/day free)
- Mozilla Observatory API
- SSL Labs API
- HTTP Archive / CrUX API (real-world Core Web Vitals)
- Common Crawl (massive free web crawl dataset)
- Bing Web Search API (free tier)
- DuckDuckGo HTML scraping

### Open-source libraries we bundle
- Wappalyzer (tech stack detection, MIT)
- Tesseract.js (OCR, Apache 2.0)
- Lighthouse CI (full Lighthouse audits)
- pytrends (Google Trends)
- Playwright (browser automation, Apache 2.0)
- Scrapy (crawler framework, BSD)

### Optional BYO key integrations
- DataForSEO ($0.0006-$0.05 per request — for advanced features)
- Serper.dev / SerpAPI (for heavy SERP scraping)
- OpenAI / Anthropic (for AI features beyond local Ollama)

---

## Part 20: Current Status

Project not yet started. We're at the planning phase complete, ready to begin Week 1-2 (Foundation).

Pre-build checklist:
- [ ] Validate with 15-20 working SEOs
- [ ] Lock in product name and domain
- [ ] Set up GitHub org and repo
- [ ] Create public roadmap
- [ ] Recruit first contributors
- [ ] Set up Discord/Slack community
- [ ] Begin Week 1-2 build
