# Cabinet d’audit SEO (SEOmator → SEO-Tool)

SEO-Tool becomes an **internal SEO audit firm**: clients, sites, SEOmator
runs, normalized issues, history/diffs, and an action plan.

## Architecture

| Layer | Store | Role |
|---|---|---|
| Legacy SEO-Tool | SQLite (`SEO_DB_PATH`) | Rank tracking, reports, agent, tools… |
| **Cabinet** | **PostgreSQL** (`DATABASE_URL`) | Clients → sites → SEOmator audits → actions |

SEOmator remains the **audit engine only** (not Electron, not its SQLite).
SEO-Tool owns persistence, UI, diffs and prioritisation.

## Setup

```bash
# 1. Postgres
export DATABASE_URL=postgresql://seotool:seotool@127.0.0.1:5432/seotool

# 2. Migrate cabinet schema
pnpm db:cabinet:migrate

# 3. Run the app
pnpm dev
# Open http://localhost:3000/cabinet
```

Docker Compose includes a `postgres` service and injects `DATABASE_URL`.

## API

| Method | Path | Purpose |
|---|---|---|
| POST/GET | `/api/clients` | Create / list clients |
| GET | `/api/clients/:id` | Client + sites |
| POST | `/api/sites` | Add site |
| GET | `/api/sites/:id` | Site overview |
| POST | `/api/audits` | Enqueue SEOmator run (background) |
| GET | `/api/audits/:id` | Run status + scores |
| POST | `/api/audits/:id/import` | Import SEOmator JSON |
| GET | `/api/audits/:id/issues` | Normalized issues |
| GET | `/api/audits/compare?previous=&current=` | Diff |
| POST/PATCH | `/api/actions` · `/api/actions/:id` | Action plan |
| GET | `/api/sites/:id/audits` · `/history` · `/actions` | Site collections |

## UI

- `/cabinet` — clients
- `/cabinet/clients/:id` — sites
- `/cabinet/sites/:id` — score, categories, history, launch audit
- `/cabinet/audits/:id` — issues + create action
- `/cabinet/sites/:id/actions` — plan P0–P3

## Out of scope (for now)

GSC / GA4 / DataForSEO / Ahrefs API · client portal · billing · autonomous CMS writes.

## Full SQLite → Postgres migration

Legacy tables still run on SQLite (sync `better-sqlite3`). Migrating all
~76 tables to Postgres + UUID is a follow-up; the cabinet is the new
audit core on Postgres today.
