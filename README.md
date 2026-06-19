<div align="center">

# All-In-One Free SEO Tool — Open-Source Alternative to Ahrefs, Semrush, Moz &amp; SE Ranking

### 🚀 The complete free SEO platform. 150+ tools: site audits, rank tracking, keyword research, AI search visibility (ChatGPT · Perplexity · Gemini · AI Overviews), content briefs, backlinks, local SEO, white-label client reports, automations — all in one self-hosted app.

**Replace ₹25,000–₹65,000/month ($300–$770) of SEO subscriptions with one MIT-licensed free tool. Own your data. Works with free AI keys (Gemini, Groq) — no paid APIs required.**

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Stack](https://img.shields.io/badge/Next.js_16-React_19-cyan.svg)](#-tech-stack)
[![Self-Hosted](https://img.shields.io/badge/self_hosted-✓-green.svg)](#-install-in-one-command)
[![Free Forever](https://img.shields.io/badge/free-forever-violet.svg)](#-how-much-you-save)
[![Star us](https://img.shields.io/github/stars/IamRamgarhia/SEO-Tool?style=social)](https://github.com/IamRamgarhia/SEO-Tool)

> **Use cases:** free seo tool · all in one seo · ahrefs alternative · semrush alternative · moz alternative · open source seo · self-hosted seo · rank tracker · keyword research · technical seo · local seo · AI search optimization (GEO) · LLM citation tracking · backlink checker · content brief generator · white-label client reports · SEO automation for freelancers and small agencies

[**⚡ Install**](#-install-in-one-command) · [**💰 How much you save**](#-how-much-you-save) · [**📸 Screenshots**](#-screenshots) · [**📦 Full feature list**](#-full-feature-list) · [**🔮 Coming soon**](#-coming-soon) · [**🆘 Troubleshooting**](TROUBLESHOOTING.md) · [**❓ FAQ**](#-faq) · [**📜 License**](#-license)

![SEO Tool dashboard — health score, today's priorities, open tasks, latest audit score](docs/screenshots/01-dashboard.png)

</div>

---

## 💰 How much you save

A typical SEO professional pays **₹25,000-₹45,000 per month** ($300-$540) for tools. This one replaces all of them — for ₹0.

### Solo freelancer SEO stack (real prices, 2026)

| Tool you're paying for | What it does | Cost / month |
|---|---|---|
| Semrush Pro | Keyword research, rank tracking, audits | **₹11,700** ($140) |
| Surfer SEO Essential | Content briefs, content score | **₹7,400** ($89) |
| BrightLocal Single | Local SEO, citation tracking | **₹3,300** ($39) |
| Frase | AI content writer | **₹3,800** ($45) |
| ChatGPT Plus | AI assistant | **₹1,700** ($20) |
| **TOTAL** |  | **₹27,900 / month** |
| | | **₹3.35 lakh / year** |
| **This tool replaces all 5** | | **₹0 / month** ✅ |

### Small agency stack

| Tool | Cost / month |
|---|---|
| Ahrefs Lite | **₹10,800** ($129) |
| Semrush Pro | **₹11,700** ($140) |
| Surfer SEO Advanced | **₹18,300** ($219) |
| BrightLocal Multi | **₹6,600** ($79) |
| Frase Team | **₹9,600** ($115) |
| Reporting tool (AgencyAnalytics) | **₹6,300** ($75) |
| **TOTAL** | **₹63,300 / month** |
| | **₹7.6 lakh / year** |
| **This tool replaces all 6** | **₹0 / month** ✅ |

> *Prices accurate as of February 2026. Ahrefs / Semrush / Surfer publish official pricing on their sites — what you actually pay can be higher with add-ons (extra users, extra projects, AI credits).*

> **You're not paying for the data.** Google gives away the same data through their free APIs (Search Console, Analytics, PageSpeed, Trends, autocomplete). Ahrefs and Semrush charge you ₹10,000+/month to repackage what's already free. This tool just connects directly to the free sources.

---

## ⚡ Install in one command

No Git. No Node knowledge. No setup wizard. The installer auto-detects Docker / Node, finds a free port, runs migrations, builds for production, and opens your browser.

### 🪟 Windows (PowerShell)
```powershell
iwr -useb https://raw.githubusercontent.com/IamRamgarhia/SEO-Tool/main/install.ps1 | iex
```

### 🐧🍎 macOS / Linux
```bash
curl -fsSL https://raw.githubusercontent.com/IamRamgarhia/SEO-Tool/main/install.sh | bash
```

### 🐳 Docker manually
```bash
git clone https://github.com/IamRamgarhia/SEO-Tool.git && cd seo
docker compose up -d
```

Open <http://localhost:3000>. That's it.

---

## 📸 Screenshots

> Real screens from the running app. No mockups, no marketing renders.

### Client dashboard — health score + today's priorities
![Client dashboard for Acme Coffee Co. showing a 32/100 health score gauge, open tasks (73), client count, audits (10), and a setup checklist at 60% complete](docs/screenshots/02-client-overview.png)

Every client gets a focused workspace with a 0-100 health score, today's priorities, daily-automation card, and one-click connections to Google Search Console + Analytics 4.

### 150+ tools, organized by SEO discipline
![All Tools page showing 13 category filters — Audits & scoring, Reports, On-page, Schema, Indexing, Speed, Keywords & content, Backlinks & outreach, Local SEO, Competitors & brand, AI visibility, Imports & integrations — and a grid of tool cards including Full SEO health check, SERP feature tracker, Content attack brief, Meta tag generator, SEO code generator](docs/screenshots/03-all-tools.png)

Filter by category or pin your favorites. Each tool is single-purpose and chainable — output of one feeds the next.

### One AI chat for every SEO question
![SEO Chat interface with starter prompts including 'Walk me through Google's confirmed ranking factors in 2026', 'How do I get cited in Google AI Overviews', 'My LCP is 4.2s on mobile — what do I fix first?', and 'Should I block GPTBot? Tradeoffs?'](docs/screenshots/04-seo-chat.png)

One chat for every SEO topic — the AI auto-focuses on the right specialty (technical, on-page, AI visibility, schema, local, hreflang, CWV, and 20+ more). Drop in an image for image-SEO analysis.

### AI blog writer with client-aware briefs
![AI blog writer for Acme Coffee Co. showing topic suggestions like 'Buyer's guide: how to pick the right product for your needs' and 'Common mistakes when buying' alongside a brief form with target keyword 'best espresso machines under 500', supporting keywords, tone, audience, and length controls](docs/screenshots/05-ai-blog-writer.png)

Generates ~1200-word SEO-optimized posts. Topic suggestions are pulled from your client's real Search Console data when connected.

### Ad Funnel Architect — multi-platform paid-ads strategy
![Ad Funnel Architect with platform checkboxes for Meta, Google Search, Google Display, Google Shopping, LinkedIn, TikTok, and YouTube Ads; configured for an Acme CRM B2B SaaS targeting marketing managers with a $1000/mo lead-gen budget](docs/screenshots/06-ad-funnel-architect.png)

Pick your platforms, set your budget, describe your audience — get a ready-to-paste funnel: awareness → consideration → conversion. Platform-specific ad copy with character limits respected.

### And there's a global overview, too
![Main agency dashboard with 'Working late, here's what needs attention today' greeting, latest audit score gauge, open tasks counter (73), clients count, audits run (10), and a 5-step setup checklist with progress bar](docs/screenshots/01-dashboard.png)

The home view when you log in. Multi-client overview, today's priorities, and what changed since you were last here.

---

## 📦 Full feature list

> **150+ tools across 14 SEO disciplines.** Every category an SEO professional needs, all in one self-hosted app.

### 🔍 Site audits & technical SEO
✅ Full-site crawler with 30+ on-page checks  
✅ Core Web Vitals (PageSpeed Insights API + local Lighthouse)  
✅ Schema.org validator + generator (Article, Product, LocalBusiness, FAQ, How-To, Review, Recipe, Event, Video, Course)  
✅ Image optimization audit (WebP/AVIF conversion suggestions, alt-text gap finder)  
✅ Broken-link finder + redirect-chain inspector  
✅ Mixed-content detector + HTTPS / SSL audit  
✅ Security headers (HSTS, CSP, X-Frame-Options, Permissions-Policy)  
✅ Mobile-friendliness check + JavaScript-rendering check  
✅ Hreflang validator + sitemap generator  
✅ Robots.txt validator + generator  
✅ Server-log analyzer (Nginx + Apache) — see what Googlebot, GPTBot, ClaudeBot actually crawl  
✅ Issue severity classification (critical / high / medium / low) with Google-doc citations  
✅ "Ignore" / "mark resolved" / "false positive" workflow  
✅ Re-crawl single URL or section (no full re-crawl needed)  
✅ Crawl history with diff between two audits

### 📊 Rank tracking & SERP analysis
✅ Daily rank tracking — unlimited keywords  
✅ Mobile vs desktop tracked separately  
✅ City-level tracking (not just country) with map view  
✅ Competitor rank tracking on the same dashboard  
✅ SERP-feature presence (AI Overview, featured snippet, People Also Ask, video, image pack, FAQ)  
✅ Historical SERP screenshots with diff view  
✅ Striking-distance finder (positions 4-15, ready to push to page 1)  
✅ Keyword cannibalization detector  
✅ Headless-browser SERP scanner (no paid SERP API required)  
✅ Bing Web Search API (free tier) + DuckDuckGo fallback

### 🔑 Keyword research (truly free)
✅ Google autocomplete fan-out (no API key — public endpoint)  
✅ People Also Ask extraction  
✅ Related searches scraper  
✅ Wikipedia entity research  
✅ Reddit topic discovery  
✅ YouTube keyword research (free 10k units/day)  
✅ Search intent classifier (informational / navigational / transactional / commercial)  
✅ Keyword clustering by topic + intent  
✅ Difficulty estimate from SERP analysis  
✅ CSV import / export + Google Sheets sync  
✅ Keyword history with annotations on key dates

### ✍️ Content
✅ AI-powered content brief generator (target length, headings, semantic keywords, PAA, competitor analysis, internal linking suggestions)  
✅ Real-time content score (paste a draft, see what's missing)  
✅ Content gap analysis vs competitors  
✅ Content decay detector — pages losing traffic ranked by recovery value  
✅ Editorial calendar with workflow (idea → outline → draft → review → published)  
✅ Topic cluster builder with pillar/cluster visualization  
✅ Content templates library (how-to, listicle, comparison, ultimate guide, case study)  
✅ AI assistant — rewrite, expand, generate titles, optimize paragraphs  
✅ Plagiarism + AI-content detector before publishing  
✅ Image generation (Stable Diffusion local or BYO key)

### 🔗 Backlinks
✅ Backlink profile (GSC + Ahrefs Webmaster Tools — both free for verified sites)  
✅ New backlinks earned alerts  
✅ Lost backlinks with recovery priority  
✅ Toxic-link heuristic flagging  
✅ Disavow file generator  
✅ Outreach hub: prospects, templates, sent, replied, won  
✅ Link opportunities (competitor backlinks you don't have)  
✅ Broken link building (find broken pages on sites linking to your topic)  
✅ **314 curated backlink prospects across 50+ countries** (built-in directory)

### 👥 Competitors
✅ Auto-detected + manually added competitor list  
✅ SERP overlap (keywords they rank for that you do/don't)  
✅ Content tracker (what they published recently)  
✅ Backlink delta (new links they earned)  
✅ Change monitoring (alert when they update key pages)  
✅ SERP head-to-head with side-by-side screenshots  
✅ Share of voice — % of tracked-keyword visibility yours vs theirs

### 🤖 AI search visibility (the 2026 differentiator)
> Google AI Overviews now appear on **47% of commercial queries** ([Semrush AI Overview study, 2025](https://www.semrush.com/blog/google-ai-overviews-study/)). Gartner projects a **25% organic-traffic drop by 2028** ([Gartner 2024 prediction](https://www.gartner.com/en/newsroom/press-releases/2024-02-19-gartner-predicts-search-engine-volume-will-drop-25-percent-by-2026-due-to-ai-chatbots-and-other-virtual-agents)). Most SEO tools haven't caught up. This one has.

✅ LLM mention tracker — weekly checks across ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews  
✅ Citation analysis — when not cited, see who is (Reddit, Wikipedia, industry pubs)  
✅ Reddit monitoring for brand + competitor mentions  
✅ AI-bot crawl tracking from server logs (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot frequency)  
✅ `llms.txt` manager (generate, validate, monitor — emerging web standard)  
✅ robots.txt AI-bot policy builder (decide which AI bots to allow/block)  
✅ AI Overview presence tracker per query  
✅ Optimization suggestions (chunkable content, factual structure, citation-worthy formatting)  
✅ GEO/AEO (Generative Engine Optimization / Answer Engine Optimization) tactics built-in

### 📍 Local SEO
✅ Google Business Profile manager (direct GBP API integration)  
✅ Review hub — aggregates Google, Yelp, TripAdvisor, Trustpilot, Facebook  
✅ Citation tracker across 50+ niche directories  
✅ NAP-consistency checker  
✅ Local rank tracker by physical location within city  
✅ Local pack visibility (3-pack tracking)  
✅ Service-area page generator for multi-location businesses  
✅ Local schema templates by business type (Restaurant, Lawyer, Plumber, Dentist, Salon, etc.)  
✅ GBP photos manager + scheduler  
✅ GBP posts scheduler  
✅ Geo-IP testing — see how your site appears from different locations

### 💼 Paid ads (Ads Funnel Architect)
✅ Multi-platform support — Meta, Google Search / Display / Shopping, LinkedIn, TikTok, YouTube  
✅ Funnel-stage planner (awareness → consideration → conversion → retention)  
✅ Ad-copy generator with platform-specific rules (character limits, CTA conventions)  
✅ Keyword research for Google Ads  
✅ Landing-page audit for ads (Quality Score / Relevance prediction)  
✅ ROAS calculator + budget allocator  
✅ Image-prompt generator for ad creatives

### 📑 Reports & client management
✅ White-label PDF reports with your branding (logo, color, footer)  
✅ AI-generated executive summary (formula: [Direction] + [Win] + [Priority])  
✅ Report templates (Executive, Detailed, Technical, Local, E-commerce, Custom)  
✅ Scheduled monthly delivery via email  
✅ Client portal with magic-link access (clients see live progress without PDF)  
✅ Invoice generator (₹INR + UPI / $USD) — 1-page A4, branded  
✅ Manual data inputs (outreach, links built, comments) integrated into reports  
✅ Work-completed-this-month auto-populated from completed tasks

### 🛠️ Tasks & workflow
✅ Today / This week / This month views  
✅ Kanban + List + Calendar views  
✅ Niche-aware task templates (Local, E-commerce, SaaS, Blog, Services)  
✅ Tech-stack-aware overrides (WordPress, Shopify, Next.js, Webflow, Wix)  
✅ Auto-task generation from audit findings  
✅ Recurring task scheduler  
✅ Time tracking per task  
✅ Comments + attachments + completion log

### 🤖 Automations & daily agent
✅ **Daily agent runs ~17 automated jobs per client every day** — rank checks, audit deltas, content decay, backlink scans, GBP monitoring, alert generation  
✅ Workflow builder (drag-and-drop trigger → conditions → actions)  
✅ Pre-built workflow templates  
✅ Page change monitoring (alert on meta / H1 / title changes)  
✅ Custom monitors (brand mentions, SERP feature changes)  
✅ Webhook endpoints (incoming + outgoing)  
✅ Notification rules (Slack / Discord / Teams / email)

### 🔌 Integrations
✅ Google Search Console (free OAuth)  
✅ Google Analytics 4 (free OAuth)  
✅ Google Business Profile (free OAuth)  
✅ Bing Webmaster Tools  
✅ WordPress plugin — read/write meta, schema, redirects, alt text, robots.txt  
✅ Shopify integration  
✅ Webflow integration  
✅ Slack / Discord / Microsoft Teams webhooks  
✅ Email digests (SMTP)  
✅ **AI providers (BYO key, all optional):** OpenAI · Anthropic · Gemini · Groq · OpenRouter · DeepSeek · Perplexity · **Ollama (local, fully offline)**

### 🎨 Tech-stack-aware recommendations
> The killer feature most tools don't have. Every fix is tailored to YOUR site's CMS.

Detected automatically via Wappalyzer + HTTP signatures. Recommendations adapt per stack:

| Your stack | Example recommendation |
|---|---|
| WordPress + Astra theme + SiteGround | "Install LiteSpeed Cache + enable SG Optimizer caching at Site Tools → Speed" |
| Shopify + Dawn theme | "3 abandoned apps still loading scripts in Settings → Apps. Remove these 3." |
| Next.js 14 + Vercel | "Replace `<img>` with `next/image` on 8 detected pages. Add `priority` to LCP image." |
| Webflow | "Use Webflow's built-in SEO fields — 4 pages missing description." |
| Wix | "Wix has speed limits you can't fully fix. Here's what's controllable." |

### 🎓 Learn (built-in education)
✅ SEO basics course (12 interactive lessons, 3-5 min each)  
✅ Glossary — every term with hover tooltips throughout app  
✅ Tech-stack guides per platform  
✅ Best-practices library citing Google's actual documentation  
✅ Google algorithm-update tracker (pulls from Search Status Dashboard)

### 🔐 Privacy & data ownership
✅ **All data in a single SQLite file on your machine** — no cloud sync, no telemetry, no phone-home, no analytics  
✅ API keys + OAuth tokens encrypted at rest (AES-256-GCM)  
✅ Backup = copy the install folder  
✅ Works fully offline with Ollama for AI  
✅ Default-bind to localhost — LAN exposure is opt-in via `APP_PASSWORD`

---

## 🔮 Coming soon

Actively in development for the next 3-6 months. Want one of these sooner? Open an issue and tell us — community demand bumps it up the queue.

| Coming | What it does |
|---|---|
| 🛍️ **Shopify app** | One-click installer in Shopify App Store. Read/write product + collection meta, manage redirects, edit theme files, push JSON-LD schema. |
| 🌐 **Browser extension** | Chrome/Edge companion. Capture data from any external SEO tool (GSC, GA4, PageSpeed UI) and pipe straight into your tool. "Send to my SEO tool" button on any page. |
| 📱 **Mobile PWA** | Full progressive web app — installable on iOS/Android home screen, push notifications, offline rank reading, "tap to check ranking" on the go. |
| 🔗 **CRM integrations** (HubSpot, Pipedrive, Salesforce, Zoho) | Revenue-per-page reporting. Map organic traffic → leads → deals closed → revenue. Stakeholder reports finally show ROI in dollars, not just rankings. |
| 🏗️ **Programmatic SEO toolkit** | Generate hundreds of location/feature/comparison pages from a CSV + template. The thing SaaS teams pay $5k/mo for. |
| 🌍 **International / hreflang manager** | Multi-country, multi-language site management. Hreflang validator + generator + audit. |
| 🤖 **GitHub PR generation** | For developer clients — tool finds an issue, generates the fix as a PR against their repo, you review + merge. |
| 👥 **Team management + capacity planning** | Multi-user workspaces with roles. See who's overbooked. Auto-assign tasks by workload. |
| 📊 **Stakeholder report variants** | Same data, different audiences. CEO sees revenue and ROI. CMO sees traffic and pipeline. CTO sees technical health. |
| 🎙️ **Voice-to-task + meeting-notes integration** | Record a client call, tool transcribes + extracts action items into tasks. Fireflies / Otter integration. |
| 🔌 **Plugin marketplace** | Community-built extensions. Ship your own audit rule, niche template, report block. |
| 🧠 **Custom dashboards + chart annotations** | Drag-and-drop dashboards per client. Annotate spikes with notes (algorithm update, big campaign, etc). |

See [ROADMAP.md](ROADMAP.md) for the full v2 + v3 roadmap (~30 items). Community feedback shapes prioritization — file an issue with the 🔮 label.

---

## 🆚 vs Ahrefs, Semrush, and the rest

| | **This tool** | Ahrefs | Semrush | SerpBear | SEO Panel |
|---|---|---|---|---|---|
| Cost / month | **₹0** | ₹10,800-₹125,000 | ₹11,700-₹42,000 | ₹2,000 SERP API | Free |
| Data ownership | **You** | Them | Them | You | You |
| Rank tracking limit | **Unlimited** | 100-10,000 | 500-5,000 | Unlimited | Limited |
| Modern UI | ✅ | ✅ | ✅ | ✅ | ❌ (2010-era PHP) |
| AI features | **BYO key, free** | Built-in (charges extra) | Built-in (charges extra) | ❌ | ❌ |
| Local SEO | ✅ Full GBP integration | Limited | ✅ Add-on | ❌ | Basic |
| AI Overview tracking | **✅** | Limited | Limited | ❌ | ❌ |
| White-label reports | **✅ Free** | Higher tiers only | Higher tiers only | ❌ | ✅ |
| Daily automation | **17 jobs / client** | Manual | Manual | Manual | Limited |
| Source available | **✅ Audit it yourself** | ❌ | ❌ | ✅ | ✅ |
| Works offline | **✅ with Ollama** | ❌ | ❌ | ❌ | ❌ |
| Tech-stack-aware fixes | **✅** | ❌ | ❌ | ❌ | ❌ |
| Ad funnel architect | **✅ All major platforms** | ❌ | Basic | ❌ | ❌ |

---

## ⚡ First 5 minutes after install

1. **Add a client** at `/clients/new` — paste a domain, the tool auto-detects tech stack + niche
2. **Connect Google** under Settings → Integrations (free GSC + GA4 + PageSpeed)
3. **Pick AI provider** under Settings → AI:
   - 🆓 **Ollama** — free, private, fully offline  
   - 🆓 **Gemini / Groq / OpenRouter** — free tiers, just paste an API key  
   - 💰 OpenAI / Anthropic — paid, BYO key
4. **Run your first audit** — click "Run audit" on any client
5. **Watch the daily agent kick in 24h later** — 17 automated jobs per client

---

## 🛠️ Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** strict
- **SQLite** (better-sqlite3) + **Drizzle ORM** — one file, no Postgres required
- **Playwright** (headless Chromium) — rank checking, SERP scraping, GBP scraping
- **Tailwind 4** + **motion** library + **shadcn**-style components
- **Satori** + **resvg-js** for OG-image generation (no headless Chrome)
- **PDFKit** for reports + invoices
- Optional: **Ollama** for local AI, **Browserless** for remote Chromium

Runs on a $5/month VPS (1 GB RAM) for solo / small-agency use. See [`docs/HOSTING.md`](docs/HOSTING.md) for Hetzner / Railway / Hostinger guides.

---

## ❓ FAQ

<details>
<summary><strong>Is this really free?</strong></summary>

Yes — fully self-hostable under the **[MIT License](LICENSE)**. No usage limits, no feature gates, no telemetry, no commercial restrictions. Use it for personal SEO, paid freelance client work, running an agency, building a paid SaaS on top, or anything else. The MIT license is one of the most permissive open-source licenses there is.
</details>

<details>
<summary><strong>How does it work without paid API keys?</strong></summary>

The tool ships with a headless Chromium browser pool that scrapes Google, DuckDuckGo, and Bing for SERPs, autocomplete, related searches, and rank checks. Adding free Google API keys (GSC, GA4, PageSpeed — all free tiers, no credit card) makes it faster and more accurate, but isn't required.
</details>

<details>
<summary><strong>Can I use this for client work as a freelancer or agency?</strong></summary>

Yes. Charging clients for your SEO services using this tool is completely allowed — that's not "selling the software," it's selling your service. You can white-label reports with your own brand, run it on your own infrastructure, and bill clients however you want.
</details>

<details>
<summary><strong>How does it compare to Ahrefs / Semrush?</strong></summary>

Ahrefs and Semrush have larger backlink indexes and pay for premium SERP APIs at scale. This tool uses free Google APIs + headless browsers, which is slower at huge scale but free forever. For SEOs managing 1-25 client websites, the difference rarely matters — and you'll save ₹3-7 lakh/year ($3,000-$7,000).
</details>

<details>
<summary><strong>Does it run on a $5/month VPS?</strong></summary>

Yes. Tested on Hetzner CX11 (1 GB RAM). Daily agent + 5 clients with full rank tracking fits comfortably. The headless browser pool is the dominant resource — disable it in Settings if you only need audits + content tools.
</details>

<details>
<summary><strong>Can I run this fully offline?</strong></summary>

Yes. Install [Ollama](https://ollama.com/) for local AI (Llama 3.2 / Phi-3 / Mistral). SERP scraping and Google API calls still need internet, but everything else — audits, content, schema, internal linking, reports — runs offline.
</details>

<details>
<summary><strong>How is data stored?</strong></summary>

A single `data.db` SQLite file in your install folder. API keys and OAuth tokens are encrypted at rest with AES-256-GCM. Backup = copy the folder. Migrate machines = copy the folder.
</details>

<details>
<summary><strong>What about SEO Panel / SerpBear / SEOnaut / RustySEO?</strong></summary>

This tool absorbs the best ideas from each: SEO Panel's multi-client + white-label, SerpBear's rank tracking + GSC integration, SEOnaut's severity-classified audits, RustySEO's local AI + log analysis. Plus genuinely new pieces no other open-source tool has: LLM-citation tracking, ad-funnel architect, content decay detector, niche-aware task templates, tech-stack-aware recommendations.
</details>

<details>
<summary><strong>Does it support non-English sites?</strong></summary>

Yes. Audits and rank tracking work for any country and language (country + BCP-47 language stored per client). Content generation respects the configured language. UI is English-only for now — translations welcome via PR.
</details>

<details>
<summary><strong>What if my CMS isn't supported?</strong></summary>

The tool detects 2,500+ technologies via Wappalyzer. Tech-stack-aware recommendations exist for WordPress, Shopify, Next.js, Webflow, Wix, Squarespace, Laravel, custom PHP, and ~20 more. For anything else, you get generic recommendations + a "give my developer instructions" button that generates a clear ticket.
</details>

---

## 👋 Who built this?

**Built solo by [Prince Ramgarhia](https://github.com/IamRamgarhia) (DiceCodes)** — a full-stack developer based in Punjab, India, building products end-to-end.

This SEO platform exists because every existing tool either costs ₹10,000+/month or has critical gaps (no AI-search tracking, no integrated workflow, dated UI). Rather than pick one, I built the integrated tool I wanted as a freelance SEO myself: modern stack, free-first, privacy-first, tech-stack-aware.

**Other shipped work:**
- 🌐 [dicecodes.com](https://dicecodes.com) — portfolio + past projects
- 🧾 [Free GST Billing Software](https://github.com/IamRamgarhia/Free-GST-Billing-Software) — open-source invoicing for Indian small businesses

**Why trust a solo project over established SaaS?**
- The full source is here — read it, audit it, fork it
- Issues + PRs get a same-week response (solo dev = no support-tier roulette)
- **MIT license** guarantees the tool stays free for everyone forever — even if DiceCodes vanishes tomorrow, anyone can continue, fork, or commercialise it

**Want to hire the builder for your own product?** See [Need custom software?](#-need-custom-software-like-this-we-build-it) below.

---

## 📜 License

**[MIT License](LICENSE)** — one of the most permissive open-source licenses in existence.

### ✅ You CAN, freely:
- Self-host for your own SEO work (any scale)
- Use it for paid freelance / agency client work
- Modify, fork, and adapt the code
- **Sell** the software or a modified version
- Offer it as a **paid hosted SaaS**
- Re-license your fork under any license you want
- Bundle it inside a commercial product

### Only requirements:
- Keep the MIT copyright + permission notice in copies / substantial portions
- That's it. No other strings attached.

A maintainer credit + "support this project" donation prompt is included in the app, but neither is a license requirement — you can strip them in your fork. Asking nicely: leaving the credit in place helps other SEOs find the project.

---

## ⭐ Support this project

If this tool saves you a ₹10,000+/month Ahrefs subscription, the cheapest way to say thanks:

- **⭐ Star this repo** — helps other SEOs discover it (huge impact, zero cost)
- **💜 Tip via UPI** — `princeramgarhiaa-1@okaxis` (₹100 / ₹300 / ₹500 / ₹1000 presets in-app)
- **💳 Donate via PayPal** (international, cards / bank / PayPal balance) — <https://www.paypal.com/donate/?business=princeramgarhiaa@gmail.com&currency_code=USD&item_name=Support%20DiceCodes>
- **🛠️ Contribute** — open issues, send PRs, suggest features

---

<div align="center">

## 🚀 Need custom software like this? We build it.

**DiceCodes builds full-stack web apps end-to-end — solo, no agency overhead.**

This entire SEO platform (150+ tools, AI daily agent, headless browser pool, white-label reports) was built by one person. If you have a startup idea, an internal tool you wish existed, or a SaaS product to launch — we can build it.

| What we build | Typical timeline |
|---|---|
| 🚀 **Startup MVPs** — idea → shipping product | 4-12 weeks |
| 🤖 **AI-powered apps** — RAG, agents, automation workflows | 4-8 weeks |
| 🛠️ **Internal tools + dashboards** for ops teams | 2-6 weeks |
| 💼 **SaaS platforms** with billing, auth, multi-tenancy | 8-16 weeks |

📧 **Email [Contact@dicecodes.com](mailto:Contact@dicecodes.com?subject=Custom%20software%20enquiry)** to start your build  
🌐 **See past work at [dicecodes.com](https://dicecodes.com)**

> *Separate from the SEO tool's license — that conversation is about reselling THIS software. This is about building NEW software for your idea.*

---

## Built by [DiceCodes](https://dicecodes.com)

Solo-built. No VC. No growth team. Just one developer trying to make pro-grade SEO tooling permanently free for everyone.

**🌐** [dicecodes.com](https://dicecodes.com) · **📧** [Contact@dicecodes.com](mailto:Contact@dicecodes.com) · **🐙** [GitHub](https://github.com/IamRamgarhia/SEO-Tool)

---

### Tags

`seo` `seo-tool` `seo-software` `self-hosted` `open-source-seo` `ahrefs-alternative` `semrush-alternative` `rank-tracker` `site-audit` `keyword-research` `backlink-analysis` `local-seo` `ai-seo` `geo-seo` `aeo` `llm-seo` `chatgpt-seo` `free-seo-tool` `wordpress-seo` `shopify-seo` `nextjs` `sqlite` `playwright` `typescript` `india`

</div>
