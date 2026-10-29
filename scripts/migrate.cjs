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

  // A table rebuild needs foreign keys genuinely off, and asking for it
  // from inside the SQL does not work.
  //
  // drizzle-kit cannot ALTER a constraint on SQLite, so to add one it
  // emits a rebuild: CREATE __new_x, copy the rows, DROP x, RENAME. It
  // wraps that in `PRAGMA foreign_keys=OFF` / `=ON`. But SQLite only
  // honours that pragma when no transaction is pending, and every
  // migration here runs inside one — so the pragma was a silent no-op
  // and the rebuild ran with enforcement still ON. Both consequences
  // were measured on a seeded copy before this was written:
  //
  //   - one orphaned row aborts the entire migration with "FOREIGN KEY
  //     constraint failed". `predev` and `prebuild` call this script, so
  //     the app then refuses to start — a bricked upgrade.
  //   - `DROP TABLE parent` performs an implicit DELETE FROM, which
  //     fires children's ON DELETE CASCADE. Rebuilding uptime_targets
  //     would have deleted every row of uptime_pings.
  //
  // Turning it off before opening the transaction does work, and costs
  // no atomicity: the statements still commit or roll back together.
  const needsFkOff = /PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(sql);

  const tx = sqlite.transaction(() => {
    for (const stmt of statements) sqlite.exec(stmt);
    // Enforcement was off for the rebuild, so nothing checked the rows
    // that were copied across. Check them now, while still inside the
    // transaction — a violation here throws, which rolls the whole
    // migration back rather than committing a broken schema.
    if (needsFkOff) {
      const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        const where = violations
          .slice(0, 5)
          .map((v) => `${v.table}.rowid=${v.rowid} -> ${v.parent}`)
          .join("; ");
        throw new Error(
          `${violations.length} foreign key violation(s) after rebuild: ${where}`,
        );
      }
    }
    sqlite
      .prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      )
      .run(f, Date.now());
  });
  try {
    if (needsFkOff) sqlite.pragma("foreign_keys = OFF");
    tx();
    if (needsFkOff) sqlite.pragma("foreign_keys = ON");
    count += 1;
    console.log(`[migrate] applied ${f}`);
  } catch (err) {
    // Restore enforcement before anything else. The replay below runs
    // outside a transaction and the loop continues to later migrations;
    // leaving it off would silently unenforce every one of them.
    if (needsFkOff) sqlite.pragma("foreign_keys = ON");
    // The "already exists / duplicate column" fast-path used to mark
    // the migration as applied without re-running the SQL. That is
    // unsafe: the migration ran inside a transaction, so the failing
    // statement rolled back ALL other statements in the file too —
    // including new tables, indexes, or rows that have not yet been
    // applied. Marking it "done" hides the real state and the next
    // migration may assume those objects exist.
    //
    // Re-attempt the migration statement-by-statement OUTSIDE a
    // transaction, skipping individual statements that fail with
    // "already exists" / "duplicate column". If every statement either
    // succeeds or is a benign no-op, mark it applied. Otherwise bail.
    if (/already exists|duplicate column/i.test(err.message)) {
      let allBenign = true;
      let appliedAny = false;
      for (const stmt of statements) {
        try {
          sqlite.exec(stmt);
          appliedAny = true;
        } catch (e2) {
          if (/already exists|duplicate column/i.test(e2.message)) continue;
          allBenign = false;
          console.error(
            `[migrate] failed on ${f} (statement-level replay):`,
            e2.message,
          );
          break;
        }
      }
      if (allBenign) {
        sqlite
          .prepare(
            "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
          )
          .run(f, Date.now());
        console.log(
          appliedAny
            ? `[migrate] ${f} — recovered, applied missing statements + marked done.`
            : `[migrate] ${f} — schema already current, marked applied.`,
        );
        count += 1;
        continue;
      }
      // Fall through to hard failure
    }
    console.error(`[migrate] failed on ${f}:`, err.message);
    process.exit(1);
  }
}

if (count > 0) {
  console.log(`[migrate] ${count} new migration(s) applied.`);
}
sqlite.close();
