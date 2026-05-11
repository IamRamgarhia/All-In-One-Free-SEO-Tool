# Migrations

## How they're applied

`scripts/migrate.cjs` reads the `.sql` files in this folder, sorts by filename,
and applies each one not yet recorded in the `__drizzle_migrations` table.
Statements are split on `--> statement-breakpoint`. The Docker entrypoint runs
this on every boot.

## Journal vs SQL drift (intentional)

The Drizzle journal (`meta/_journal.json`) and snapshot files (`meta/*.json`)
only cover `0000` through `0022`. Migrations `0023` onward were authored as
hand-written SQL and applied directly without regenerating snapshots.

This is **fine for production** because `migrate.cjs` works off the SQL files
and the in-DB `__drizzle_migrations` table — it never reads the journal.

The drift only affects `drizzle-kit generate` — if you change `schema.ts` and
re-generate, the diff will be computed against the `0019` snapshot, which is
out of date. **Do not blindly run `drizzle-kit generate` against this repo.**

## To re-align the journal (future cleanup)

1. Spin up a fresh empty SQLite DB.
2. Run every SQL migration in order.
3. Run `pnpm db:generate` once with the current `schema.ts` to capture an
   accurate snapshot of the final state.
4. Either delete and regenerate all SQL + snapshots, or accept a single
   `00XX_realign.sql` that's a no-op and write snapshots forward from there.

Until that's done, treat the SQL files as the source of truth and edit
`schema.ts` to mirror them by hand for type-safety.
