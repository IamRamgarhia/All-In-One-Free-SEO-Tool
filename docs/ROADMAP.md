# Roadmap

Public-facing roadmap for the SEO Tool. Community feedback shapes prioritization — file an issue with the `🔮 roadmap` label to upvote anything below.

**Last updated:** October 2026

---

## ✅ Shipped (v1)

The current `main` branch covers everything below. Install via [README → Install in one command](../README.md#-install-in-one-command).

- Multi-client management, niche detection (5 niches), tech-stack auto-detection (2,500+ technologies via Wappalyzer)
- Full-site crawler with 30+ on-page checks, severity classification, "fix it for me" wizards
- Rank tracking (unlimited keywords, each re-checked at least weekly in a rotating daily share; mobile vs desktop, city-level), SERP-feature presence, striking-distance + cannibalization detectors
- Keyword research via Google autocomplete + PAA + Reddit + YouTube + Wikipedia (no paid API keys)
- AI-powered content briefs, real-time content score, content decay detector, content gap analysis
- Backlink profile (GSC + Ahrefs Webmaster Tools), toxic-link flagging, disavow generator, outreach hub, 314 curated backlink prospects
- AI search visibility — LLM mention tracker (ChatGPT, Perplexity, Claude, Gemini, AI Overviews), `llms.txt` manager, AI-bot crawl tracking
- Local SEO — GBP manager, review hub, citation tracker, local rank tracker with map view, GBP photos + posts scheduler
- White-label PDF reports with AI executive summary, scheduled email delivery, client portal with magic-link access
- Invoice generator (INR + UPI, USD via PayPal)
- WordPress plugin with one-click apply + full undo
- Daily agent — ~20 automated jobs a day across every client, plus a weekly block
- Browser extension, programmatic SEO generator, hreflang validator + generator, GitHub PR generation, team accounts with roles + capacity view, chart annotations
- Workflow builder, page change monitoring, custom monitors, webhook endpoints
- Slack / Discord / Teams digests
- AI providers — Ollama (free local), Gemini, Groq, OpenRouter (free tiers), OpenAI, Anthropic, DeepSeek, Perplexity (BYO key)

---

## 🔨 Active development (next 3-6 months)

In priority order. Bumps happen based on community demand.

### 🛍️ Shopify app
One-click installer in the Shopify App Store. Read/write product + collection meta, manage redirects, edit theme files, push JSON-LD schema. Same pattern as the WordPress plugin but native to Shopify's admin chrome.

### 📱 Mobile PWA
Full progressive web app — installable on iOS/Android home screen, push notifications, offline rank reading, "tap to check ranking" on the go.

### 🔗 CRM integrations
HubSpot first, then Pipedrive, Salesforce, Zoho. Maps organic traffic → leads → deals closed → revenue. Stakeholder reports finally show ROI in dollars, not just rankings — the single biggest gap in mid-market SEO tooling.

### 📊 Stakeholder report variants
Same data, different audiences. CEO sees revenue and ROI. CMO sees traffic and pipeline. CTO sees technical health. Junior marketer sees what's been done. One report-builder, four audience-aware exports.

### 🎙️ Voice-to-task + meeting-notes integration
Record a client call, tool transcribes + extracts action items into tasks. Fireflies / Otter integration. Eliminates the "I forgot what the client asked for" gap.

### 🔌 Plugin marketplace
Community-built extensions. Ship your own audit rule, niche template, report block, daily-agent job. Curated + signed.

### 🧠 Custom dashboards
Drag-and-drop dashboards per client. Annotate spikes with notes (algorithm update, big campaign launched, content publish event). Makes monthly review conversations 3× shorter.

---

## 🌌 Longer-term (6-18 months)

### Native mobile apps
Beyond PWA — iOS + Android native for offline-first rank reading + push alerts at scale.

### Plagiarism + AI-content detector
Already partially shipped (basic detector exists). Full integration with Copyscape + Originality.ai pattern for pre-publish checks.

### Stable Diffusion image generation
Built-in image generation for hero images + content visuals, using local Stable Diffusion or BYO API key. Avoid the $30/month Midjourney sub for content marketing.

### Webflow / Squarespace / Wix integrations
Same pattern as the WordPress plugin — direct API integration so the tool can apply fixes without copy-paste.

### Server log analysis (expanded)
Already shipped basic Nginx/Apache log analyzer. v2: full crawl pattern visualization, bot fingerprinting, alert on Googlebot drop, AI-bot crawl-rate trends.

### Public API (expanded)
v1 API exists at `/api/v1/*` (read access for keywords, clients, audits, rankings). v2: full write access, webhook endpoints, public OpenAPI spec, SDK in JS + Python.

### Audit logs (multi-user)
Who changed what when, across the workspace. Required for agency compliance.

### Multi-touch attribution
Beyond first-touch organic — full multi-touch with cross-channel weighting. Pulls from GA4 + CRM data already integrated.

---

## ❌ Explicitly NOT planned

To save time on issues / PRs for these:

- **Our own backlink index.** Even Ahrefs has a stale index. We use GSC + Ahrefs Webmaster Tools (both free for verified site owners). Don't reinvent.
- **Competing with Screaming Frog on raw crawl depth.** Match basics, win on integration. SF is the right tool for 500k+ URL audits.
- **Custom AI model training.** Use the best LLM API for the job (BYO key) — training a domain-specific model has poor ROI for an SEO tool.
- **Enterprise SSO / SAML.** Built for freelancers + small agencies. If you're 50+ seats, the integrated workflow benefits diminish anyway.
- **Hosted SaaS version (by DiceCodes).** Intentionally self-hosted only as our official distribution. With the MIT license, anyone is free to fork it and run a paid hosted version.

---

## How to influence the roadmap

1. **File an issue** describing the feature or fix you need
2. **Upvote with reactions** — 👍 on existing issues counts more than duplicate filings
3. **Comment with your use case** — "I need this because X" is more actionable than "+1"
4. **Sponsor via [PayPal](https://www.paypal.com/donate/?business=princeramgarhiaa@gmail.com) or [UPI](../README.md#-support-this-project)** — sponsored features get queue-jumped

For paid expedited feature development (your feature shipped in a defined timeline), email [Contact@dicecodes.com](mailto:Contact@dicecodes.com?subject=Sponsored%20feature%20development).
