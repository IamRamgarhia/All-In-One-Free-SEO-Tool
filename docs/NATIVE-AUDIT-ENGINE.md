# Native audit engine (`src/audit`)

SEO-Tool keeps its product surface. Technical audit depth is **ported** from
SEOmator expertise into an isolated module — not a second product, and not a
hard runtime dependency on `@seomator/seo-audit` for the long term.

## Layout

```
src/audit/
  types/          AuditRule, RuleResult, AuditContext, CrawlResult…
  crawler/        fetch, robots, sitemap, BFS crawl, link graph
  rendering/      Optional Playwright + DOM compare + lab CWV
  rules/          Category folders (core … legal/geo)
  engine/         registry, runner, scoring + caps, diff
  storage/        persist into main SQLite via Drizzle
```

## Waves (all shipped)

| Wave | Categories |
|---|---|
| 1 | core, technical, crawlability |
| 2 | links, redirect, url |
| 3 | js, perf, images (+ optional Playwright / CWV) |
| 4 | content, schema, security, html |
| 5 | a11y, mobile, i18n, eeat, social, geo, legal |

- **Audit rapide** — HTML only, 1 page (Playwright **off**)
- **Audit complet** — multi-page crawl; Playwright render + CWV on start URL + ≤2 more pages
- Persistence: `native_audit_*` tables on the existing client schema
- UI: `/clients/[id]` + `/audits/native/[id]`
- API: `GET|POST /api/v1/native-audits`

Legacy crawler and the temporary SEOmator npm bridge stay until the native
engine is validated in production, then the bridge can be removed.

## Scoring

- Per-rule weights → category score → weighted overall
- Caps: noindex, robots block, missing title, thin page (&lt;20 words)
- Diff by `rule_id`: fail→pass fixed, pass→fail regression, warn→fail worsened
