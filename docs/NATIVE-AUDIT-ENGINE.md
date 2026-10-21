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

## Wave 3 (shipped)

| Category | Focus |
|---|---|
| js | SSR shell, raw vs rendered title/H1/meta/canonical/links/noindex, console errors |
| perf | Lab CWV (LCP/CLS/FCP/TTFB), render-blocking, asset weight heuristics |
| images | alt presence/quality, dimensions, lazy-load, modern formats |

- **Audit rapide** — HTML only, 1 page (Playwright **off**); Wave 1–3 rules (JS/CWV → `unmeasured`)
- **Audit complet** — multi-page crawl; Playwright render + CWV on start URL + up to 2 more pages
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

4 content / schema / security / html  
5 a11y / mobile / i18n / eeat / social / geo / legal
