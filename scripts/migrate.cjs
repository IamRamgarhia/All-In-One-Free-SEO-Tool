/* eslint-disable @typescript-eslint/no-require-imports */
// Production migration runner — invoked from the Docker entrypoint.
// Uses better-sqlite3 directly (no tsx dependency) so it works in the
// minimal runtime image. Has to be CJS because the runtime image runs
// before any TS / ESM tooling is available.
const path = require("node:path");
const Database = require("better-sqlite3");
const fs = require("node:fs");

const dbPath = process.env.SEO_DB_PATH || path.join(process.cwd(), "data.db");
const dir = path.dirname(dbPath);
fs.mkdirSync(dir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const migrationsDir = path.join(__dirname, "..", "src", "db", "migrations");
if (!fs.existsSync(migrationsDir)) {
  console.log("[migrate] No migrations directory — skipping.");
  process.exit(0);
}

// Drizzle's migration table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at INTEGER
  );
`);

const applied = new Set(
  sqlite.prepare("SELECT hash FROM __drizzle_migrations").all().map((r) => r.hash),
);

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let count = 0;
for (const f of files) {
  if (applied.has(f)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, f), "utf-8");
  // Drizzle's SQL files use --> statement-breakpoint between statements
  const statements = sql
    .split(/-->\s*statement-breakpoint/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const tx = sqlite.transaction(() => {
    for (const stmt of statements) sqlite.exec(stmt);
    sqlite
      .prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      )
      .run(f, Date.now());
  });
  try {
    tx();
    count += 1;
    console.log(`[migrate] applied ${f}`);
  } catch (err) {
    console.error(`[migrate] failed on ${f}:`, err.message);
    process.exit(1);
  }
}

console.log(`[migrate] ${count} new migrations applied; up to date.`);
sqlite.close();
