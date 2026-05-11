/* eslint-disable @typescript-eslint/no-require-imports */
// Production migration runner — invoked from the Docker entrypoint and from
// `predev` / `prebuild` package scripts.
//
// Uses better-sqlite3 directly (no tsx dependency) so it works in the
// minimal runtime image. CJS because it runs before any TS/ESM tooling.
//
// Idempotent across two scenarios:
//   1. Fresh install (new data.db) → applies every SQL file in order.
//   2. Existing dev DB previously migrated by drizzle-kit (hashes recorded
//      instead of filenames) → detects pre-applied state and silently
//      records all current filenames as applied without re-running.
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
  sqlite
    .prepare("SELECT hash FROM __drizzle_migrations")
    .all()
    .map((r) => r.hash),
);

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Detect "schema already present but tracked under different hash format" —
// e.g. dev DBs that were originally migrated by drizzle-kit (which stores
// content-hashes, not filenames). If we see core tables already exist AND
// none of our filename hashes match, assume the schema is current and just
// record every filename as applied.
function hasCoreTables() {
  const row = sqlite
    .prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='clients'",
    )
    .get();
  return row && row.n > 0;
}
const filenameMatches = files.some((f) => applied.has(f));
if (!filenameMatches && hasCoreTables() && applied.size > 0) {
  // Pre-existing DB migrated by drizzle-kit. Record filenames silently.
  const ins = sqlite.prepare(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
  );
  const tx = sqlite.transaction(() => {
    for (const f of files) ins.run(f, Date.now());
  });
  tx();
  console.log(
    `[migrate] detected pre-existing schema — recorded ${files.length} migration filenames as applied.`,
  );
  sqlite.close();
  process.exit(0);
}

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
    // Tolerate "already exists" on individual ALTER / CREATE statements —
    // happens when a previous run partially applied. Record the migration
    // as applied so we don't retry.
    if (/already exists|duplicate column/i.test(err.message)) {
      try {
        sqlite
          .prepare(
            "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
          )
          .run(f, Date.now());
        console.log(`[migrate] ${f} — schema already current, marked applied.`);
        count += 1;
        continue;
      } catch {
        // fall through
      }
    }
    console.error(`[migrate] failed on ${f}:`, err.message);
    process.exit(1);
  }
}

if (count > 0) {
  console.log(`[migrate] ${count} new migration(s) applied.`);
}
sqlite.close();
