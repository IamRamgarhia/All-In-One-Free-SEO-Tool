# Native audit engine (`src/audit`)

SEO-Tool keeps its product surface. Technical audit depth is **ported** from
SEOmator expertise into an isolated module — not a second product, and not a
hard runtime dependency on `@seomator/seo-audit` for the long term.

## Layout

```
src/audit/
  types/          AuditRule, RuleResult, AuditContext, CrawlResult…
  crawler/        fetch, robots, sitemap, BFS crawl, link graph
  rendering/      Playwright stub (Wave 3)
  rules/          Wave folders (core, technical, crawlability, …)
  engine/         registry, runner, scoring + caps, diff
  storage/        persist into main SQLite via Drizzle
```

## Wave 1 (shipped)

| Category | Rules (approx.) |
|---|---|
| core | titles, meta, H1, canonicals, robots, viewport, OG basics |
| technical | HTTP, soft-404, HTTPS, mixed content, robots/sitemap, empty HTML |
| crawlability | orphans, click depth, sitemap coverage, robots block, canonical chain |

- **Audit rapide** — HTML only, 1 page (Playwright off)
- **Audit complet** — multi-page crawl, still no Playwright in Wave 1
- Persistence: `native_audit_runs` / `native_audit_issues` / `native_audit_rule_history` / `native_audit_diffs`
- UI: `/clients/[id]` buttons + `/audits/native/[id]`
- API: `GET|POST /api/v1/native-audits`

Legacy crawler (`src/lib/audit.ts`) and the temporary SEOmator npm bridge stay
until later waves are stable.

## Scoring

- Per-rule weights → category score → weighted overall
- Caps: noindex, robots block, missing title, thin page (&lt;20 words)
- Diff by `rule_id`: fail→pass fixed, pass→fail regression, warn→fail worsened

## Next waves

2 links/redirects/url · 3 JS/perf/images (+ Playwright) · 4 content/schema/security/html · 5 a11y/mobile/i18n/eeat/social/geo/legal
