/**
 * Dev-mode migration watcher. Runs alongside `next dev` so a new .sql
 * migration or schema change applied mid-session doesn't require the
 * developer to manually stop + restart the server.
 *
 * Usage:
 *   pnpm run dev:watch     (or npm run dev:watch)
 *
 * What it does:
 *   1. Runs migrate.cjs once (same as `predev`) — safe idempotent no-op
 *      when the DB is already up to date.
 *   2. Spawns `next dev` as a child process with stdio inherited so
 *      Next's output looks identical to a plain `next dev`.
 *   3. Watches src/db/migrations/*.sql for adds/changes. When a new
 *      .sql file appears, re-runs migrate.cjs against the live data.db
 *      and touches src/db/schema.ts so Next's file watcher picks up
 *      the change and hot-reloads any server code importing it.
 *   4. Watches src/db/schema.ts directly — schema changes without an
 *      accompanying .sql (e.g. type-only Drizzle helpers) don't need
 *      migration but do need Next to reload.
 *
 * Cross-platform: uses fs.watch (works on Windows, macOS, Linux),
 * spawn with shell:true, no bash-only idioms. Zero new dependencies.
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "src", "db", "migrations");
const SCHEMA_FILE = path.join(REPO_ROOT, "src", "db", "schema.ts");
const MIGRATE_SCRIPT = path.join(__dirname, "migrate.cjs");

function log(msg) {
  console.log(`[migrate-watch] ${msg}`);
}

// 1. Initial migration — same behavior as predev.
log("running initial migrations…");
const initial = spawnSync(process.execPath, [MIGRATE_SCRIPT], {
  stdio: "inherit",
  cwd: REPO_ROOT,
});
if (initial.status !== 0) {
  log(`initial migration exited with code ${initial.status}. Aborting dev startup.`);
  process.exit(initial.status ?? 1);
}

// 2. Spawn `next dev`. Use pnpm/npm auto-detected from the parent process
//    (npm_execpath is set by npm/pnpm/yarn when they run a script).
const runner = process.env.npm_execpath || "npm";
const useNodeRunner = /\.(js|cjs|mjs)$/i.test(runner);
let nextDev;
if (useNodeRunner) {
  nextDev = spawn(process.execPath, [runner, "run", "dev"], {
    stdio: "inherit",
    cwd: REPO_ROOT,
    env: process.env,
  });
} else {
  // Direct npm/pnpm/yarn binary — shell:true so Windows can resolve .cmd
  nextDev = spawn(runner, ["run", "dev"], {
    stdio: "inherit",
    cwd: REPO_ROOT,
    env: process.env,
    shell: true,
  });
}

nextDev.on("exit", (code) => {
  log(`next dev exited with code ${code}. Shutting down watcher.`);
  process.exit(code ?? 0);
});

// 3. Watch the migrations dir + schema file.
let migrationDebounce = null;
let schemaDebounce = null;

function rerunMigrations(trigger) {
  log(`change detected in ${trigger} — re-running migrations…`);
  const r = spawnSync(process.execPath, [MIGRATE_SCRIPT], {
    stdio: "inherit",
    cwd: REPO_ROOT,
  });
  if (r.status === 0) {
    // Touch schema.ts so Next's TS watcher hot-reloads consumers.
    try {
      const now = new Date();
      fs.utimesSync(SCHEMA_FILE, now, now);
      log("migrations applied. Touched schema.ts so Next hot-reloads.");
    } catch {
      log("migrations applied. (Couldn't touch schema.ts; save any file in src/ to force hot-reload.)");
    }
  } else {
    log(`migration failed with code ${r.status}. Fix the SQL and the next save will retry.`);
  }
}

try {
  fs.watch(MIGRATIONS_DIR, { persistent: true }, (_evt, filename) => {
    if (!filename || !filename.endsWith(".sql")) return;
    clearTimeout(migrationDebounce);
    migrationDebounce = setTimeout(() => {
      rerunMigrations(`migrations/${filename}`);
    }, 500);
  });
  log(`watching ${path.relative(REPO_ROOT, MIGRATIONS_DIR)} for new .sql files.`);
} catch (err) {
  log(`couldn't watch migrations dir: ${err.message}. New .sql files will still be picked up on next dev restart.`);
}

try {
  fs.watch(SCHEMA_FILE, { persistent: true }, () => {
    clearTimeout(schemaDebounce);
    schemaDebounce = setTimeout(() => {
      log("schema.ts changed. Run `pnpm run db:generate` when you're ready to persist as a migration.");
    }, 1000);
  });
  log(`watching ${path.relative(REPO_ROOT, SCHEMA_FILE)}.`);
} catch {
  // ignore — schema.ts changes are still picked up by Next's own watcher
}

// 4. Forward SIGINT / SIGTERM so Ctrl+C shuts down both the watcher
//    and the spawned next dev cleanly.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    log(`received ${signal}. Stopping next dev…`);
    if (nextDev && !nextDev.killed) nextDev.kill(signal);
  });
}
