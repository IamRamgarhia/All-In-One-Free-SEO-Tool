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
  rules/          Wave folders (core, technical, crawlability, links, …)
  engine/         registry, runner, scoring + caps, diff
  storage/        persist into main SQLite via Drizzle
```

## Wave 1 (shipped)

| Category | Focus |
|---|---|
| core | titles, meta, H1, canonicals, robots, viewport, OG |
| technical | HTTP, soft-404, HTTPS, mixed content, robots/sitemap |
| crawlability | orphans, depth, sitemap cross-checks, hreflang basics, pagination |

## Wave 2 (shipped)

| Category | Focus |
|---|---|
| links | anchors, broken internal (capped HEAD), nofollow, localhost, fragments, inbound equity |
| redirect | loops, meta/JS refresh, chain length, broken targets |
| url | length, case, underscores, tracking/session params, double slash |

- **Audit rapide** — HTML only, 1 page (Playwright off); Wave 1–2 rules
- **Audit complet** — multi-page crawl; Wave 1–2 rules; Playwright still off
- Persistence: `native_audit_*` tables on the existing client schema
- UI: `/clients/[id]` + `/audits/native/[id]`
- API: `GET|POST /api/v1/native-audits`

Legacy crawler and the temporary SEOmator npm bridge stay until later waves
are stable.

## Scoring

- Per-rule weights → category score → weighted overall
- Caps: noindex, robots block, missing title, thin page (&lt;20 words)
- Diff by `rule_id`: fail→pass fixed, pass→fail regression, warn→fail worsened

## Next waves

3 javascript / performance / images (+ optional Playwright + CWV)  
4 content / schema / security / html  
5 a11y / mobile / i18n / eeat / social / geo / legal
