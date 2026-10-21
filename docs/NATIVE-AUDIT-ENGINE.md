# Technical audit engine

SEO-Tool’s deep technical audit runs **SEOmator’s 373 rules / 20 categories**
into the existing `/audits` tables (`kind = "seomator"`).

## Current product path (corrected)

| Mode | Behaviour |
|---|---|
| **Audit rapide** | SEOmator quick categories + CWV |
| **Audit complet** | Full 373-rule crawl + CWV |

- Playwright goes through the **shared browser-pool** (`src/audit/rendering/browser-pool-fetcher.ts`) with SSRF guard + synthetic INP when measuring CWV.
- Results land in `audits` / `audit_issues` — same UI as `/audits/[id]`.
- The incomplete hand-rolled Waves 1–5 rule set under `src/audit/rules` (~216 rules) and the parallel `native_audit_*` / `/audits/native` / `/api/v1/native-audits` surfaces were a mistake and are **no longer the primary path**. Native API/pages were removed; `native_audit_*` tables remain in the schema for cleanup in a follow-up migration.

## `src/audit` still hosts

```
src/audit/
  rendering/   browser-pool fetcher (used by the live 373-rule run)
  crawler/     fetch with status-bearing redirect chains (for remaining native rules)
  rules/       incomplete Wave port — not the production engine
  engine/      scoring helpers / leftover runner
  storage/     native_audit_* writers (legacy; do not use for new audits)
```

Long-term: vendor the full SEOmator rule sources into `src/audit/rules` and drop the `@seomator/seo-audit` npm dependency once parity tests stay green without it.

## Scoring / UI

Category scores, caps, CWV, and markdown summary are produced by the SEOmator
result mapper (`src/lib/seomator-audit.ts`) and shown on `/audits/[id]`.
