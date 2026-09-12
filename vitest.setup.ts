/**
 * Keep the unit suite away from the real database.
 *
 * `pnpm test` is meant to be pure logic, and mostly is — but a pure
 * function often lives in a module that also talks to the database, and
 * importing it runs `src/db/client.ts`, which opens `data.db` and sets
 * `journal_mode = WAL` at import time.
 *
 * That is enough to break the suite intermittently. Vitest runs test
 * files in parallel workers, so several of them open the same file at
 * once; and a developer with the app running has it open already. The
 * symptom is `SqliteError: disk I/O error` on a different test file each
 * run, with every individual assertion passing — which reads as
 * flakiness in the tests rather than as contention over one file.
 *
 * Each worker gets its own throwaway database instead.
 *
 * It used to be left empty, on the rule that `pnpm test` is pure logic.
 * It is now migrated, because the rule was costing the tests that matter
 * most. The one guarding this repo's newest table says a scheduled crawl
 * must never overwrite something a person typed, and there is no way to
 * assert that without writing both and reading them back. Sending it to
 * the e2e suite would have meant the guard ran on a branch nobody
 * watches, for a failure nobody would notice for months.
 *
 * The cost is about 200ms per worker on an empty file, once. Tests that
 * never touch the database are unaffected; they just get a schema they
 * do not use.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "seo-vitest-"));
const dbPath = path.join(dir, "test.db");

// Set before any test file is imported, which is the whole point of a
// setup file — src/db/client.ts reads this at module scope.
process.env.SEO_DB_PATH = dbPath;
process.env.SEO_DATA_DIR = dir;

// The same runner Docker and `predev` use, so a migration that works
// here works there. Calling it as a subprocess rather than importing it
// keeps it CJS-only, which is why it survives in the minimal image.
execFileSync(
  process.execPath,
  [path.join(__dirname, "scripts", "migrate.cjs")],
  { env: { ...process.env, SEO_DB_PATH: dbPath }, stdio: "pipe" },
);
