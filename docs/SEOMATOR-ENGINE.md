# SEOmator as an engine inside SEO-Tool

SEO-Tool stays SEO-Tool (CRM, agent, ranks, reports, `/clients`, `/audits`,
`/tasks`). SEOmator is **not** forked into a second product — it is the
deep technical audit library we call from the existing audit pipeline.

## How SEOmator presents itself

| Surface | What it is |
|---|---|
| `@seomator/seo-audit` npm | Programmatic `createAuditor()` + 373 rules |
| CLI `seomator` | Terminal audit / crawl / HTML·JSON·MD reports |
| Electron app | Visual dashboard + its own SQLite history |
| Claude skill | Agent-facing wrapper around the same engine |

We only use the **npm library**. No Electron, no SEOmator SQLite, no
`/cabinet` clone.

## How it plugs into this app

```
/clients/[id]  "Run audit"
       │
       ▼
runSeomatorAuditForClient  (src/app/audits/actions.ts)
       │
       ▼
runSeomatorAudit → createAuditor({ measureCwv, … }).auditWithCrawl()
       │
       ▼
mapSeomatorResult  → findings type=seomator:*, categoryScores, raw
       │
       ├─ audits (kind=seomator, score, summary, category_scores, raw_report)
       ├─ audit_issues (severity, fix_steps, category)
       ├─ audit_rule_history (for /audits/diff)
       └─ tasks  title=[P0]…[P3]  source_ref=seomator:…
```

Agent autopilot keeps reading `kind=crawler` only. SEOmator findings are
for humans + the task board; the executor does not invent fixes for
`seomator:*` types it cannot apply.

## What it needs

| Need | In this repo |
|---|---|
| Node ≥ 20 | engines in package.json |
| `@seomator/seo-audit` | dependency |
| Chromium / Playwright | for Core Web Vitals + JS render (`measureCwv: true`); app already ships Playwright |
| Network egress | live fetch of the client URL, robots.txt, sitemap |
| Optional | `staging: true` to waive noindex caps on staging sites (not wired yet) |

Without a browser, CWV / JS / asset rules return `not-measured` (honest),
not fake passes.

## What SEOmator has that the built-in crawler lacks

Built-in crawler ≈ **72** finding types (plus tech-stack extras). SEOmator
= **373 rules / 20 weighted categories**.

| Category | Weight | Gap vs crawler |
|---|---:|---|
| Core | 11% | Partial overlap (title, meta, H1, canonical…) — SEOmator deeper on canonical conflicts/loops |
| Performance + CWV | 10% | **Major** — LCP/CLS/INP/TTFB/FCP, compression, cache, HTTP/2 |
| Links | 8% | Deeper inbound equity / chrome vs content / orphans |
| Images | 8% | Partial — SEOmator more format/encoding/picture |
| Security | 8% | **Major** — headers beyond a single “missing headers” check |
| Accessibility | 7% | **Major** — ~36 rules; crawler barely touches a11y |
| Technical SEO | 7% | Overlap + extras |
| Crawlability | 5% | Sitemap/robots cross-checks at scale |
| Structured data | 5% | **Major** — real schema validation vs “missing schema” |
| JS rendering | 5% | **Major** — raw vs rendered DOM |
| Content | 5% | Partial |
| E-E-A-T | 3% | **Major** — almost absent in crawler |
| Social / URL / Redirects / Mobile / i18n / HTML val / Legal / GEO | 2–3% each | GEO/llms.txt/AI bots partially covered; rest thin or missing |

SEO-Tool still wins on: client CRM, agent auto-fix for crawler types,
rank tracking, reports, WP/Shopify/Next **tech-stack** checks, GSC/GBP
integrations.

## What we integrate (bricks, not a clone)

Already in the app:

- Primary **Run audit** = SEOmator crawl on existing routes
- Persist category scores + raw report + rule history
- P0–P3 tasks on `/tasks`
- Diff of issues + categories + rule status

Added to close remaining gaps without becoming SEOmator:

- Category **display names + weights** from the package registry
- Vendored **fix suggestions** (npm does not export them)
- **CWV strip** + **score-cap** honesty on `/audits/[id]`
- Rule titles via `getRuleById`
- Explainer fallback for `seomator:*` types
- Optional **Quick audit** (core / technical / security / crawl / perf) — same engine, same tables

## Non-goals

- Rebuilding SEOmator’s Electron UI or CLI
- Replacing the agent crawl (keeps auto-fix vocabulary)
- A second clients/sites database or `/cabinet` world
