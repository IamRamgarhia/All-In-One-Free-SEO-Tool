# Competitive review — August 2026

What the rest of the market is doing, what we should copy, and what we
should deliberately not.

**Method.** Inventoried what we actually ship (99 tools, 235 pages, 52
audit checks — counted, not remembered), then researched the paid and
open-source field, then compared. Where a recommendation depends on a
detail of our own code, that code was read. Claims about competitors come
from published comparisons and their own docs; nobody's tool was
installed, so treat capability claims about *them* as their marketing
until verified.

---

## 1. Our competitive intelligence was out of date

`CLAUDE.md` Part 2 says:

> **OpenSEO** — modern Next.js, but only 3 stars on GitHub, requires
> DataForSEO ($50+ minimum) — not truly free.

Two of those three facts have changed. OpenSEO now has **~2,100 stars**,
covers keyword research, rank tracking, backlinks, audits *and* AI
visibility, and ships an **MCP server for Claude Code**. It is still
DataForSEO-dependent, which remains our genuine advantage — but "3 stars"
as a reason to dismiss it is no longer true, and repeating it in the
README would read as either lazy or dishonest to anyone who checks.

The open-source field as it actually stands:

| Project | Stars | Shape |
|---|---|---|
| SEOMachine | 7.1k | AI long-form content workspace for Claude Code (Python) |
| OpenSEO | 2.1k | All-in-one, DataForSEO-backed, has an MCP server |
| SerpBear | 2.0k | Rank tracking, 8 SERP providers, GSC integration |
| openserp | 745 | Go SERP-scraping API/CLI — Google, Yandex, Baidu |
| SEOnaut | 717 | Technical audit, no paid dependencies |
| LibreCrawl | 681 | Crawler with JS rendering, no URL cap |
| RustySEO | 276 | Rust desktop toolkit |
| SEO Panel | 146 | Legacy PHP multi-site panel |
| elmo | 124 | AI-visibility mention tracking |

**Nothing here has our shape.** They are single-purpose tools or
paid-API front-ends. The integrated workflow — clients, tasks, audits,
reports, and an agent that applies and reverses fixes — is still ours
alone in open source. That position is real and worth defending.

**Action:** correct the OpenSEO line in `CLAUDE.md` and the README FAQ.
Re-check star counts before any future comparison ships.

---

## 2. The biggest gap: we have no MCP server

This is the one recommendation I would act on before any other.

MCP is now the standard way AI assistants reach live SEO data. There is
an entire category of Google-Search-Console MCP servers, and OpenSEO
ships one. Practitioners are driving SEO work from Claude Code and
Cursor rather than from dashboards.

We are unusually well-placed for this and are not exploiting it:

- We already hold a **unified time-series store** — GSC, GA4, audits,
  rank history, AI-visibility checks, tasks, backlinks — in one SQLite
  file. Every GSC-only MCP server is a thin wrapper over one API. Ours
  would be the only one backed by a full history.
- We already attach **provenance** to numbers (`ConfidenceBadge`,
  `FreshnessBadge`, `grounding` on AI-visibility rows). One competing
  server advertises "anti-hallucination provenance metadata" as a
  headline feature. We built that months ago for our own UI.
- We can **write**, not just read. The WordPress bridge applies fixes
  and every change records an undo. No other SEO MCP server can act.

The pitch writes itself: *the only SEO MCP server that owns your history
and can fix what it finds.*

**Effort:** moderate. A stdio MCP server exposing read tools over the
existing query layer, plus a small set of write tools gated behind the
same autonomy levels the agent already respects. No new data model.

**Caveat worth stating:** write tools over MCP hand an external model the
ability to change a live site. It must reuse `willAutoApply` and the
existing `needs_review` risk levels rather than inventing a second
permission system — the agent already learned that lesson.

---

## 3. Orphan detection: fix the audit the way we just fixed the tool

We proved this week that a link-following crawl **cannot** find orphan
pages: a page with no inbound links is never fetched, so it never appears
in the results. `analyseInternalLinks` now seeds from the sitemap and
finds them correctly.

`src/lib/audit.ts` still has the original version, and is honest about it
in a comment:

> Doesn't catch true orphans (you'd need the full link graph) but flags
> obvious crawl-only-via-direct-URL pages.

That comment is now out of date in our favour — `crawlSite` gained
`seedUrls`, and `audit.ts` already fetches `sitemap.xml` for the
`missing_sitemap` check. Wiring the two together makes the
`orphan_pages` finding genuinely correct.

It matters more than a single check, because `orphan_pages` is one of the
findings the agent acts on. A finding that under-reports means work the
agent never does.

**Effort:** very small. **Impact:** a shipped check goes from partial to
correct, and Screaming Frog lists orphan detection as a headline feature.

---

## 4. Content scoring: already built well — but 20% of it is folklore

I expected to recommend building this. We already have it, and it uses
the same method the paid tools do.

`content-grader.ts` pulls the top-10 organic results, fetches each,
extracts the main body text, then computes median word count, the top-60
TF-IDF terms across that corpus, and headings appearing across multiple
results. That is materially what Clearscope and Surfer do — top 10–20
ranking pages, terms and structure the winners share — with no paid API,
no embedding model, no third-party NLP.

**The problem is the scoring, not the method.** The 100 points break down
as length 0–30, term coverage 0–50, and **keyword density 0–20**, with
full marks for landing in a 0.5%–1.5% band.

`CLAUDE.md` Part 3.7 lists, under bad SEO advice that will **not** be in
this tool:

> - "Keyword density should be 2-3%" (Google says this isn't a thing)

So a fifth of the score a user is asked to optimise toward is a metric
our own documentation calls folklore. Worse than merely useless: a writer
chasing those 20 points is being actively pushed to repeat an exact-match
phrase in prose that didn't need it — which is the behaviour Google's
spam guidance is aimed at, and the opposite of what the coverage score is
correctly rewarding.

**Recommended fix.** Keep density as a *diagnostic*, drop it as a target.
Above roughly 3.5% is a genuine stuffing signal worth warning about; a
low density is not a defect if term coverage is good. Redistribute the 20
points into term coverage, which is the legitimate signal and already the
largest component.

**Effort:** small — a scoring change and the copy around it.
**Impact:** removes the clearest instance of the tool contradicting its
own stated principles, in a tool that is otherwise a credible substitute
for a $89–219/month product.

This is worth a wider check: it is unlikely to be the only place a
scoring heuristic drifted from Part 3.7.

---

## 5. AI visibility: we track presence, they sell citation intelligence

Our coverage is better than I expected. `ai_visibility_checks` spans
twelve API providers plus browser-scraped Google AI Mode and Copilot, and
— importantly — distinguishes a **grounded** answer (the model actually
searched) from model memory. That distinction is the difference between
measuring AI search and measuring what a model happened to memorise, and
most tools blur it.

What the dedicated tools sell on top is *source-level citation
intelligence*: not "are you mentioned" but "who is cited instead of you,
from which domains, and what would it take to displace them." Profound
built a $1bn valuation largely on that framing.

We already store `citations` per check. Aggregating that into "the
domains that get cited for your topics, ranked, with your share" turns
data we are already collecting into the answer people are paying for.

**Effort:** small-to-medium — it is mostly aggregation over an existing
column. **Impact:** high, in the category with the most attention.

Also worth adding: ChatGPT and Grok as browser-scraped surfaces, to sit
alongside Google AI Mode and Copilot.

---

## 6. Audit depth — selectively, not competitively

Sitebulb advertises 300+ checks. We have 52. **Do not chase that number.**
Most of the gap is long-tail checks that fire rarely and produce noise,
and our differentiator has never been crawl depth — Part 2 of `CLAUDE.md`
says so explicitly.

Worth adding, because each has real consequence and we have the data:

- **Crawl-budget signals from server logs.** We already ingest logs
  (`/bot-logs`). Pages crawled often but never converting, and pages
  never crawled at all, is a Botify-tier insight we are one query away
  from.
- **JS-rendered link discovery.** LibreCrawl leads on this. We have
  Playwright and a `js_rendered_only` check already; extending it to
  discover links that only exist after render closes a real blind spot
  on React/Vue sites.
- **Rich-result eligibility per type.** We validate schema; we don't say
  "this qualifies for FAQ but fails Product because price is missing."
  That is the actionable half.

---

## 7. Where we already lead, and should say so louder

- **Agentic SEO is now a crowded paid category** — Frase, NoimosAI,
  Botify, Otto AI all claim autonomous CMS fixes. Every one is hosted
  SaaS. We are the only self-hosted, free, source-available agent that
  writes to a live CMS.
- **Every change is reversible.** I have not found a competitor that
  records an undo for each automated edit. After this week's work ours is
  verified end to end, including whole-article restore. This is the
  strongest trust argument the project has and it is currently buried.
- **Provenance on every number.** Increasingly a selling point elsewhere;
  standard here since months ago.

---

## 8. Explicitly not worth building

- **A backlink index.** Already ruled out in `CLAUDE.md` and still right.
- **300-check parity with Sitebulb.** Noise, not value.
- **Our own SERP API.** `openserp` exists, is MIT, and is Go — either
  adopt it as an optional backend or learn from it. Rebuilding it is
  months of maintenance against an adversary that changes weekly.
- **A Claude-Code-workspace content tool.** SEOMachine owns that shape
  with 7.1k stars and it is a different product from ours.

---

## Recommended order

1. **Drop keyword density from the content score** — small, and it
   removes the tool contradicting its own documented principles.
2. **Sitemap-seed the audit crawl** — hours, fixes a shipped check the
   agent depends on.
3. **MCP server** — the highest-leverage new thing, and it plays to
   architecture we already have.
4. **Citation-source aggregation** for AI visibility — mostly
   aggregation over a column we already populate.

Items 1 and 2 are both smaller than a morning and both fix something
currently wrong. Do those before building anything new.

---

## The uncomfortable framing

None of the above is the biggest risk to our competitive position.

This week alone: the WordPress integration had never once worked, the
agent reported alt text and schema as fixed while writing empty strings,
orphan detection could never find an orphan, and undo would have restored
the wrong revision on any active site. Every one of those was reviewed
code that looked correct.

We are already ahead of the open-source field on features. We are behind
SerpBear — a tool that does one thing — on whether the features work.
**Another twenty tools would not change our standing as much as making
the ninety-nine we have provably work.** Verification is the competitive
strategy; the feature list is not the constraint.

---

## Sources

- [10 Best AI Search Monitoring Tools — Otterly](https://otterly.ai/blog/10-best-ai-search-monitoring-and-llm-monitoring-solutions/)
- [Best AI Visibility Tools 2026: Profound vs Peec vs Otterly — Surmado](https://www.surmado.com/blog/best-ai-visibility-tools-2026)
- [The Best Open Source SEO Tools in 2026 — OpenSEO](https://openseo.so/blogs/best-open-source-seo-tools)
- [Open-Source SEO Crawlers in 2026 — Seodisias](https://seodisias.com/blog/open-source-seo-crawlers/)
- [Screaming Frog vs Sitebulb 2026 — Slow SEO](https://slowseo.com/screaming-frog-vs-sitebulb-2026/)
- [Surfer SEO vs Clearscope vs MarketMuse — Genesys Growth](https://genesysgrowth.com/blog/surfer-seo-vs-clearscope-vs-marketmuse)
- [SEO Content Tools Compared — Conbersa](https://www.conbersa.ai/learn/seo-content-optimization-comparison)
- [AI Agents for SEO: The 2026 Guide — Lyzr](https://www.lyzr.ai/blog/ai-agents-for-seo/)
- [Best Agentic SEO Tools — Stridec](https://stridec.com/blog/best-agentic-seo-tools-automate-search-strategy/)
- [Best MCP Server for SEO — SEOProfy](https://seoprofy.com/blog/best-mcp-server-for-seo/)
- [Top SEO MCP Servers in 2026 — SEOptimer](https://www.seoptimer.com/blog/seo-mcp/)
- [mcp-gsc — GitHub](https://github.com/AminForou/mcp-gsc)
