# Audit firm mode (one product)

SEO-Tool is the product. SEOmator is the **technical audit engine** (373 rules).
There is no second UI, no parallel `/cabinet`, and no second client database.

## What you use

| Surface | Role |
|---|---|
| `/clients` · `/clients/[id]` | CRM — run **Run audit** (SEOmator) or Agent crawl |
| `/audits` · `/audits/c/[clientId]` · `/audits/[id]` | Audit history, category scores, issues |
| `/audits/diff?a=&b=` | Issue + category + rule-status diffs |
| `/tasks` | Action plan — SEOmator findings land as `[P0]`–`[P3]` tasks |

## Engines

| `audits.kind` | Engine | When |
|---|---|---|
| `seomator` | SEOmator (373 rules / ~20 categories) | Default human audit — health score preference |
| `crawler` | Built-in crawl (~72 finding types) | Agent autopilot auto-fixes only |
| `ai_full` | AI single-page | Optional AI pass |

Agent planners keep filtering on `kind = crawler`. SEOmator findings use
`seomator:*` types and are **not** auto-fixed by the agent.

## Schema bricks (same SQLite app DB today)

- `audits.category_scores` / `audits.raw_report` — SEOmator payload
- `audit_rule_history` — per-rule status for diffs across runs
- `tasks` with `source_ref = seomator:…` and titles `[P0]`…`[P3]`

## Postgres

One destination: migrate **this** app schema to PostgreSQL (`DATABASE_URL`).
See [POSTGRES-MIGRATION.md](./POSTGRES-MIGRATION.md). Do not stand up a
second clients/sites/audits schema.
