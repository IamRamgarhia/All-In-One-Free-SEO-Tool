# Technical audit engine

SEO-Tool’s **production** deep technical audit is **SEOmator** (`@seomator/seo-audit`):
**373 rules / 20 categories**, stored in `audits` with `kind = "seomator"`.

## Product path

| Mode | Behaviour |
|---|---|
| **Audit rapide** | SEOmator quick categories + CWV (`runSeomatorAuditForClient(..., "quick")`) |
| **Audit complet** | Full 373-rule crawl + CWV (`"full"`) |

- Playwright uses the **shared browser-pool** (`src/audit/rendering/browser-pool-fetcher.ts`).
- UI: `/audits/[id]` — category scores, caps, CWV, rule history, diff via `/audits/diff`.
- Exports: `/audits/[id]/export?format=markdown|llm`.

## Cleanup (parallel native experiment removed)

The Waves 1–5 **native sidecar** (~216 rules, `/audits/native`, `/api/v1/native-audits`,
`native_audit_*` tables) was a mistaken parallel path. It is **removed from the product**;
migration `0074_drop_native_audit_engine.sql` drops the orphan tables.

## `src/audit` (sidecar only)

Incomplete in-house rule port + crawler helpers — **not** used for client quick/full buttons.
Long-term option: vendor full SEOmator sources here and drop the npm package when parity tests allow.
