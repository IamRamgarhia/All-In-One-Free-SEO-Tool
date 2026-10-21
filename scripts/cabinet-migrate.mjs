/**
 * Apply cabinet PostgreSQL migrations (drizzle SQL files) in order.
 *
 * Usage: node scripts/cabinet-migrate.mjs
 * Requires DATABASE_URL.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const dir = path.join(process.cwd(), "src/db/cabinet/migrations");
const sql = postgres(url, { max: 1 });

await sql`
  CREATE TABLE IF NOT EXISTS cabinet_drizzle_migrations (
    id serial PRIMARY KEY,
    hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`;

const applied = new Set(
  (await sql`SELECT hash FROM cabinet_drizzle_migrations`).map((r) => r.hash),
);

const files = (await readdir(dir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip ${file}`);
    continue;
  }
  const body = await readFile(path.join(dir, file), "utf8");
  // drizzle-kit wraps statements with --> statement-breakpoint
  const statements = body
    .split(/--> statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`apply ${file} (${statements.length} statements)`);
  await sql.begin(async (tx) => {
    for (const statement of statements) {
      await tx.unsafe(statement);
    }
    await tx`INSERT INTO cabinet_drizzle_migrations (hash) VALUES (${file})`;
  });
}

await sql.end();
console.log("cabinet migrations done");
