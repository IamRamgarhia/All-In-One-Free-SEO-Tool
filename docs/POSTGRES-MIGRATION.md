# SQLite → PostgreSQL (real app schema)

## Goal

One store. The existing ~75 tables (`clients`, `audits`, `tasks`, ranks,
reports, agent, …) move to PostgreSQL. Integer PKs stay. No UUID rewrite.
No parallel “cabinet” database.

## Why now

SEOmator audits store large JSON (`raw_report`, category scores, rule
history). Concurrent agency use and Docker deploys fit Postgres better than
a single `data.db` file. The dual-DB experiment (Postgres cabinet + SQLite
legacy) is abandoned — it created two products.

## Target stack

| Piece | Choice |
|---|---|
| Driver | `postgres` (postgres.js) — already a dependency |
| ORM | `drizzle-orm/postgres-js` + `pgTable` |
| URL | `DATABASE_URL=postgresql://…` |
| Fallback | `SEO_DB_PATH` SQLite until cutover is complete |

## Cutover steps (ordered)

1. **Keep shipping on SQLite** while SEOmator bricks land on the real
   routes (`/clients`, `/audits`, `/tasks`).
2. Generate `src/db/schema.pg.ts` from `schema.ts` (`sqliteTable` →
   `pgTable`, `integer` timestamps → `timestamp`, JSON text → `jsonb`,
   boolean integers → `boolean`).
3. Point `src/db/client.ts` at Postgres when `DATABASE_URL` is set;
   otherwise keep better-sqlite3.
4. Rewrite SQL migrations under `src/db/migrations-pg/` (or drizzle-kit
   push for greenfield).
5. One-shot data copy: `scripts/sqlite-to-pg.mjs` (table-by-table,
   preserve ids).
6. Flip Docker: `SEO` service uses `DATABASE_URL` only; drop `SEO_DB_PATH`
   volume for new installs.
7. Remove SQLite client path after soak.

## Docker today

`docker-compose.yml` already ships a `postgres:16` service and injects
`DATABASE_URL`. Until step 3 ships, the app still reads SQLite
(`SEO_DB_PATH=/data/data.db`). Postgres is reserved for the cutover — not
a second product.

## Non-goals

- UUID primary keys across the board
- A separate clients/sites/actions schema
- Redirecting users from `/clients` to another world
