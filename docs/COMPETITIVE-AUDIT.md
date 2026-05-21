# Competitive landscape audit — what we have vs what the market offers

Date: 2026-05-21
Method: web research + codebase cross-reference

This audit benchmarks our tool against the current 2026 SEO landscape — Ahrefs, Semrush, Otterly.AI, Rankability, Quattr, MarketMuse, SerpBear, SEO Panel, plus the GEO-tool ecosystem (Otterly, Rankability, LLMrefs, etc.).

---

## Headline

**We have ~90 tool routes shipped, free-first, self-hostable.** The free-stack story is genuinely stronger than any competitor — every paid alternative starts at $29/month (Otterly Lite) and most start at $99-199/month (Moz Pro, Ahrefs, Semrush, SE Ranking).

**Where we win:**
- Truly free path on every tool — Pollinations.ai for image gen, free LLMs for AI, browser-mode for rank tracking, GSC for backlinks. None of the paid alternatives can claim this.
- Self-hosted (no monthly subscription) — Semrush is $199/mo, Ahrefs is $129/mo+, Otterly's mid-tier is $189/mo.
- WordPress bridge for one-click fixes — most competitors stop at "here's what to fix"; we apply it.
- Integrated workflow (clients + tasks + audits + reports) — many competitors are single-purpose.

**Where we have real gaps** (detailed below): CRM revenue attribution, sentiment analysis on AI mentions, formalized GEO SWOT, social signals, topical-authority-depth scoring, BI dashboard templates, AI-answer-vs-SERP overlap analysis.

---

## Coverage map — what we have, verified against the codebase

### ✅ Strong coverage (matches or beats competitors)

| Capability | Our route(s) | Competitor comparison |
|------------|-------------|----------------------|
| Site audit (~30 checks) | `/audits`, `/tools/headers`, `/tools/canonical-audit`, `/tools/render`, `/tools/schema-validate`, `/tools/security`, `/tools/mobile-friendly` | Matches Screaming Frog + Semrush Site Audit basics. Honest about depth vs Screaming Frog. |
| Keyword research | `/keywords` (autocomplete + PAA + Reddit + YouTube), `/tools/keyword-difficulty`, `/tools/search-volume` | Free via autocomplete; paid tools have larger indexes but we work without keys. |
| Rank tracking | `/keywords` (browser-mode), `/local-rank`, `/local-grid` | SerpBear-style coverage. ~±1-2 noise (now surfaced via the rank-column tooltip). |
| AI visibility / GEO | `/ai-visibility`, `/brand-monitor`, `/seo-chat`, `/citations`, `/tools/ai-citation-tactics`, `/tools/aio-passage`, `/tools/geo-score`, `/llms-txt`, `/bot-logs` | Comparable to Otterly + Rankability core. See gap-list below for what they have we don't. |
| Brand SERP + Knowledge Panel | `/brand-serp`, `/knowledge-panel`, `/brand-monitor` | Solid; few competitors have this as a dedicated tool. |
| Content tools | `/content`, `/content-decay`, `/content-gap`, `/topic-clusters`, `/blog`, `/tools/brief`, `/tools/content-grader`, `/tools/content-score`, `/tools/eeat-audit`, `/tools/plagiarism`, `/tools/ai-slop` | Matches Frase/Surfer/Swiftbrief on briefs; lighter on topical-depth scoring than MarketMuse. |
| Internal linking | `/tools/auto-link`, `/tools/link-recommender`, `/tools/pagerank`, `/tools/link-graph`, `/tools/internal-linking`, `/tools/anchor-distribution` | Quattr-level capabilities; verify entity-aware ranking is in place. |
| Schema markup | `/tools/schema`, `/tools/ai-schema`, `/tools/schema-validate`, `/tools/person-schema`, `/tools/hreflang`, `/tools/hreflang-gen` | Strong. Schema is a 2026 critical lever for AI citation. |
| Local SEO | `/gbp`, `/citations`, `/local-rank`, `/local-grid` | Matches BrightLocal / Whitespark fundamentals at $0. |
| Backlinks | `/backlinks` (GSC + Common Crawl + Ahrefs WMT import) | Honest-about-limits banner shipped. Realistically lighter than paid; the WMT import path closes much of the gap free. |
| Performance / CWV | `/cwv`, `/tools/crux`, `/tools/crux-origin`, `/tools/local-cwv`, `/tools/perf-budget`, `/tools/render` | Matches PageSpeed Insights + WebPageTest workflow at $0. |
| Reports + branding | `/reports`, `/portal`, `/digest`, `/agency-week`, white-label PDF | The killer time-saver. ~25 min/client vs 6h. |
| Daily AI agent | `/agent`, daily-agent.ts (17+ steps now fault-isolated) | Unique — no competitor runs a daily multi-step agent across the SEO stack. |
| Auto-backup | tickAutoBackup, /settings/backup | Shipped today. No competitor offers automated DB snapshots of YOUR data. |
| Cost-per-client AI tracking | /settings/ai-usage | Shipped today. Agencies bill clients accurately. |
| Image gen (free) | `/tools/image-gen` (Pollinations default) | Shipped today. Otterly + Frase use OpenAI only (paid). |
| Tech detection | Wappalyzer OSS bundled | Standard. Free. |

### 🟡 Light coverage — exists but could be deepened

| Capability | Our state | What competitors do better |
|------------|-----------|----------------------------|
| **Topical authority scoring** | `/topic-clusters` (visual map) | MarketMuse + Quattr score articles 0-100 on topical depth and surface "missing subtopics" lists. We cluster but don't score depth. |
| **Entity recognition + knowledge graph** | Schema generators handle structured data | Quattr extracts entities from content and maps relationships. We don't have an explicit entity-graph view. |
| **Content brief EEAT enrichment** | `/tools/brief` + `/tools/eeat-audit` exist separately | Swiftbrief integrates EEAT factors directly into the brief output (author authority signals, brand integration, contextual keyword mapping). Worth combining. |
| **Internal linking — entity-aware** | Pagerank + auto-link based on overlap | Quattr links new content to existing pillars based on entity relationships, not just keyword match. |
| **AI-overview overlap with SERP** | `/tools/ai-overview` checks AIO presence | Rankability does AI-answer ↔ SERP top-10 overlap analysis (when AI cites something different from the top 10, that's the moat). We could add this. |
| **Soft 404 detection** | `/tools/soft-404` exists | Robust crawlers (Screaming Frog) detect via content patterns, not just HTTP. Verify our depth. |
| **Sitemap intelligence** | `/tools/sitemap` | Most tools validate; few diff against actual indexed pages or flag orphaned URLs. |

### ❌ Real gaps — competitors have, we don't

| Capability | Why it matters | Effort to add |
|------------|----------------|---------------|
| **CRM revenue attribution** (HubSpot / Pipedrive / Salesforce / Zoho) | Agencies need to show "SEO drove $X in pipeline this month." Currently we show traffic + clicks; the dollars come from CRM. CLAUDE.md v2 roadmap. | Medium (~1 week per CRM, OAuth + webhook + lead-source matching). |
| **Multi-touch attribution** | First-click vs last-click vs linear — most clients now ask for this. CLAUDE.md v3 roadmap. | Hard (needs CRM data + GA4 sessions + custom attribution model). |
| **Sentiment analysis on AI brand mentions** | Otterly tracks tone of AI descriptions of your brand. "ChatGPT calls you 'innovative' vs 'overpriced'." High signal for reputation work. | Small (LLM-side; pass the AI quote through a sentiment classifier — local Ollama works). |
| **Formalized GEO SWOT** | Otterly outputs a SWOT vs competitors specifically for AI visibility. We have `/tools/attack-briefs` but not a SWOT format. | Small (~1 day; LLM prompt + template). |
| **Topical authority depth scoring** | MarketMuse / Quattr score articles 0-100 on topic coverage; tell you what subtopics are missing. We cluster but don't grade. | Medium (~3 days; needs LLM + reference corpus). |
| **AI-answer ↔ SERP overlap analysis** | When AI cites someone different from Google's top 10, that's a divergence worth tracking. Rankability does this. | Small (~2 days; we already scrape both). |
| **Social signals tracking** | Facebook + Twitter + LinkedIn engagement on linked content. CLAUDE.md spec'd it; we haven't built. | Medium (each platform has its own API/scraping pattern). |
| **BI dashboard templates (Looker Studio / Metabase)** | Many agencies want their SEO data inside the BI tool they already use. We have CSV export + /api/v1; no canned dashboards. | Small (~half day per template; just provide the JSON). |
| **GA4 conversion-event mapping** | We pull traffic; conversion events (form submit, purchase, signup) live in GA4 but we don't surface them prominently. | Small (~1 day; GA4 API already connected). |
| **Server log analysis** | RustySEO + Screaming Frog Log File Analyzer do this. Tells you which pages bots actually crawl (vs which we hope they do). CLAUDE.md v2 spec. | Medium (file upload + parser). |
| **CI/CD scriptable mode** | Run `seo audit` in GitHub Actions to fail PRs that regress. RustySEO has this. | Small (we have `bin/seo` already; add a `--ci` flag with exit codes). |
| **PWA mobile app** | SerpBear has a PWA. We have a manifest.webmanifest but no native PWA install flow. | Small (mostly done; needs polish). |

### ➖ Things competitors charge for that we deliberately won't build

| Capability | Why not |
|------------|---------|
| Backlink index (Ahrefs-scale) | Building one costs millions/yr. Acknowledge + provide Ahrefs WMT free pairing. (Already done.) |
| Massive paid SERP volume | Browser-mode covers core needs free. BYO DataForSEO key for power users. |
| Custom AI model training | Out of scope. Users plug whichever LLM they like. |
| Enterprise SSO / SAML | Self-hosted local-first; if you need SSO, you're not the target user. |

---

## Five highest-ROI features to add next (chat-doable)

These are picked specifically because each is *small effort + high competitive parity gain*:

1. **Sentiment classifier on AI brand mentions** (small, ~1 day). When `/ai-visibility` collects a citation, pass the surrounding text through a sentiment prompt (local Ollama works). Shows positive/neutral/negative trend over time. **Closes the gap with Otterly's premium tier.**

2. **Formalized GEO SWOT generator** (small, ~1 day). New `/tools/geo-swot` route that takes (you, top-3 competitors, query set) → LLM-generates a SWOT specifically for AI visibility. **Closes the gap with Otterly + Rankability premium.**

3. **AI-answer ↔ SERP overlap analysis** (small, ~2 days). For each tracked keyword, run both an AI query (ChatGPT/Perplexity/Gemini) and a SERP scrape; surface which cited domains exist in BOTH and which exist in ONLY ONE. The "AI-only" set is the opportunity. **Genuinely novel; few tools do this.**

4. **CI/CD scriptable audit** (small, ~half day). Add `bin/seo ci --url=... --fail-on=critical,high` that runs the audit and exits non-zero on findings. Slots into GitHub Actions / GitLab CI. **Matches RustySEO; opens up the dev-team market.**

5. **GA4 conversion events surfaced on the client dashboard** (small, ~1 day). We already have the GA4 connection; pulling `event_count` per conversion event and showing on the client detail "Conversions this month: 47 (+18%)" is high-signal, low-effort. **Closes the gap with paid analytics dashboards.**

## Three medium-ROI follow-ups

6. **Sitemap intelligence diff** — compare sitemap vs `site:` query results to find orphans/missing.
7. **Server log analysis** — bot-crawl-frequency from Nginx/Apache logs.
8. **Topical authority depth scoring** — LLM-based article grading 0-100.

## Roadmap items that need their own engagements (multi-week)

- CRM revenue attribution (HubSpot first)
- Multi-touch attribution
- Native mobile apps
- Tauri sidecar single-file binary (already dropped per user request)

---

## Verdict

The tool is **competitively complete on free-tier capabilities**, **dominant on the workflow integration angle**, **honest about backlink-data limitations**, and **uniquely strong on the daily-agent automation pattern.**

The five small-effort gaps above would push us from "best free option" to "competitive with $200/mo paid tools on every axis except backlinks and SERP volume" — and those two are genuinely structural ceilings, not skill gaps.

---

Sources:
- [marketermilk.com — 24 best SEO tools 2026](https://www.marketermilk.com/blog/best-seo-tools)
- [g2.com — 6 Semrush alternatives compared](https://learn.g2.com/semrush-alternatives)
- [seojuice.com — 15 best open-source SEO tools 2026](https://seojuice.com/blog/top-open-source-tools-for-seo/)
- [sitepoint.com — best GEO tools 2026](https://www.sitepoint.com/best-generative-engine-optimization-tools-to-improve-ai-search-visibility-2026/)
- [otterly.ai features page](https://otterly.ai/features)
- [rankability.com — Otterly review](https://www.rankability.com/blog/otterly-ai-review/)
- [quattr.com — AEO/SEO/GEO platform](https://www.quattr.com/)
- [digitalapplied.com — technical SEO 200-item checklist](https://www.digitalapplied.com/blog/technical-seo-audit-checklist-200-items)
- [stackmatix.com — entity-based SEO + topical authority](https://www.stackmatix.com/blog/entity-based-seo-topical-authority)
- [debugbear.com — technical SEO checklist 2026](https://www.debugbear.com/blog/technical-seo-checklist)
- [aimagicx.com — GEO playbook 2026](https://www.aimagicx.com/blog/generative-engine-optimization-chatgpt-perplexity-2026)
- [llmrefs.com — Generative Engine Optimization definitive guide 2026](https://llmrefs.com/generative-engine-optimization)
- [serpbear on Railway](https://railway.com/deploy/serpbear)
- [link-assistant.com — 7 best topical authority tools 2026](https://www.link-assistant.com/news/topical-authority-tool.html)
- [prettyinsights.com — 12 best SEO tools for agencies 2026](https://prettyinsights.com/best-seo-tools-for-agencies/)
