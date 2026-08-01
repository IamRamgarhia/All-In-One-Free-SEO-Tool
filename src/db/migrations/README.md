# Migrations

## How they're applied

`scripts/migrate.cjs` reads the `.sql` files in this folder, sorts by filename,
and applies each one not yet recorded in the `__drizzle_migrations` table.
Statements are split on `--> statement-breakpoint`. The Docker entrypoint runs
this on every boot, and `predev` / `prebuild` run it locally.

## Adding a migration

```sh
# 1. Edit src/db/schema.ts
# 2. Generate the SQL + snapshot
pnpm db:generate
# 3. Apply it
pnpm db:migrate
```

`pnpm db:generate` is safe to run. It used not to be — see below.

## The journal drift, and how it was fixed (Aug 2026)

The Drizzle journal (`meta/_journal.json`) and its snapshots used to stop at
`0022`, because migrations `0023`–`0052` were hand-written SQL applied
directly without regenerating snapshots.

That was harmless in production — `migrate.cjs` works off the SQL files and the
in-DB `__drizzle_migrations` table, and never reads the journal. But it made
`drizzle-kit generate` actively dangerous, and worse than "produces a stale
diff":

- It diffed `schema.ts` against the **0022** snapshot and emitted a 576-line
  migration recreating 37 tables and adding 44 columns — every change from
  0023–0052, duplicated.
- It named that file `0023_omniscient_meteorite.sql`, which **collides with the
  existing `0023_outreach_email.sql`** and sorts *before* it.
- Since `migrate.cjs` sorts by filename, running it would have attempted
  `CREATE TABLE` on tables that already exist, on a live database.

**Fixed by `0053_realign_journal.sql`**: a deliberate no-op whose only purpose is
to carry `meta/0053_snapshot.json`, which describes the real current schema.
Future `generate` runs diff against that and emit correct incremental
migrations. Verified: a fresh DB built from all 54 SQL files, then
`pnpm db:generate`, reports *"No schema changes, nothing to migrate"*.

The intermediate snapshots (`0020`–`0052`) were never created and aren't
reconstructed — Drizzle only needs the most recent one to compute the next
diff, so their absence costs nothing.

## Editing schema.ts by hand

Still fine, and still necessary if you write raw SQL for something Drizzle
can't express. Just run `pnpm db:generate` afterwards so the snapshot keeps up
— if it reports "No schema changes", `schema.ts` and the SQL agree.
