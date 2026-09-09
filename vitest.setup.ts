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
 * Each worker gets its own throwaway database instead. The tests never
 * query it; it only has to exist so the import succeeds.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "seo-vitest-"));

// Set before any test file is imported, which is the whole point of a
// setup file — src/db/client.ts reads this at module scope.
process.env.SEO_DB_PATH = path.join(dir, "test.db");
process.env.SEO_DATA_DIR = dir;
