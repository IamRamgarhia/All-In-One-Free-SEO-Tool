#!/usr/bin/env node
/**
 * `seo update` — non-UI update path.
 *
 * Same operation as the in-app "Update now" button, but runnable
 * directly from the terminal:
 *   node bin/seo-update.cjs
 *
 * Use case: the server is broken (failed migration, missing dep, bad
 * commit) and the UI won't load. This script reaches the same end
 * state — latest commit + dependencies + migrations applied — via
 * direct git + pnpm/npm + migrate calls.
 *
 * What it does NOT touch (gitignored, preserved across upgrades):
 *   - data.db
 *   - .seo-encryption-key
 *   - .env.local
 *   - .seo-port
 *   - dev-server.log
 *
 * Falls back to a hard force-sync if a clean pull is blocked by
 * untracked / dirty files — same recovery the in-app updater uses.
 */

const path = require("node:path");
const fs = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";

function c(text, color) {
  return process.stdout.isTTY ? `${color}${text}${RESET}` : text;
}

const cwd = process.cwd();

function step(label, fn) {
  process.stdout.write(`  ${label.padEnd(40)} `);
  try {
    const detail = fn();
    console.log(c("✓", GREEN), detail ? c(detail, DIM) : "");
    return { ok: true, detail };
  } catch (err) {
    console.log(c("✗", RED), c(err.message || String(err), RED));
    return { ok: false, error: err };
  }
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 60_000,
    ...opts,
  });
}

function tryRun(cmd, args, opts) {
  try {
    return { ok: true, stdout: run(cmd, args, opts) };
  } catch (err) {
    return { ok: false, err };
  }
}

console.log("");
console.log(c(`${BOLD}SEO Tool — update from GitHub${RESET}`));
console.log("");

// Refuse to update if not a git repo (ZIP install).
const isGit = tryRun("git", ["rev-parse", "--git-dir"]);
if (!isGit.ok) {
  console.log(
    c(
      "This install is not a git repository (ZIP installer was used).",
      YELLOW,
    ),
  );
  console.log(
    c(
      "To upgrade, re-run the installer one-liner from your README — it auto-detects existing installs and refreshes in place, preserving data.db / .env.local / .seo-encryption-key.",
      DIM,
    ),
  );
  process.exit(1);
}

// Check git is installed.
const gitV = tryRun("git", ["--version"]);
if (!gitV.ok) {
  console.error(c("git not found on PATH. Install git and retry.", RED));
  process.exit(1);
}

// 1. Fetch
const fetched = step("Fetch origin/main", () => {
  run("git", ["fetch", "origin", "main"]);
  return "";
});
if (!fetched.ok) process.exit(1);

// Hash package.json before so we know if deps changed
function packageJsonHash() {
  try {
    const buf = fs.readFileSync(path.join(cwd, "package.json"));
    let h = 2166136261;
    for (let i = 0; i < buf.length; i++) {
      h = (h ^ buf[i]) >>> 0;
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16);
  } catch {
    return null;
  }
}
const pkgBefore = packageJsonHash();

// 2. Pull (fast-forward first; fall back to force-sync)
let strategy = "ff";
let pulled = step("Pull latest commit", () => {
  try {
    const out = run("git", ["pull", "--ff-only"]);
    if (/Already up to date/i.test(out)) return "already on latest";
    return out.split("\n").filter(Boolean).slice(-1)[0]?.slice(0, 60) ?? "";
  } catch {
    // ff-only failed; do force-sync
    strategy = "force-sync";
    run("git", ["clean", "-fd"]);
    const out = run("git", ["reset", "--hard", "origin/main"]);
    return `force-synced (${out.match(/HEAD is now at ([0-9a-f]+)/)?.[1] ?? "ok"})`;
  }
});
if (!pulled.ok) process.exit(1);

if (pulled.detail === "already on latest") {
  console.log("");
  console.log(c("You're already on the latest version.", GREEN));
  console.log("");
  process.exit(0);
}

// 3. Install new deps if package.json changed
const pkgAfter = packageJsonHash();
if (pkgBefore !== pkgAfter) {
  // Detect pm
  let pm = "npm";
  if (tryRun("pnpm", ["--version"]).ok) pm = "pnpm";

  step(`${pm} install (new dependencies)`, () => {
    const args = pm === "pnpm"
      ? ["install", "--prefer-offline"]
      : ["install", "--no-audit", "--no-fund"];
    const r = spawnSync(pm, args, {
      cwd,
      stdio: "inherit",
      timeout: 600_000,
    });
    if (r.status !== 0) throw new Error(`${pm} install exited ${r.status}`);
    return "";
  });
} else {
  console.log(`  ${"Install new dependencies".padEnd(40)} ${c("·", DIM)} ${c("package.json unchanged", DIM)}`);
}

// 4. Apply migrations
const migrateScript = path.join(cwd, "scripts", "migrate.cjs");
if (fs.existsSync(migrateScript)) {
  step("Apply database migrations", () => {
    const out = run("node", [migrateScript], { timeout: 120_000 });
    const m = out.match(/\d+ new migration/);
    return m ? m[0] : "schema already current";
  });
} else {
  console.log(`  ${"Apply database migrations".padEnd(40)} ${c("·", DIM)} ${c("no migrate script", DIM)}`);
}

console.log("");
console.log(c(`${BOLD}Update complete.${RESET}`));
if (strategy === "force-sync") {
  console.log(c("(Force-synced. data.db / .env.local / encryption key preserved.)", DIM));
}
console.log(c("If a server is running, restart it (bin/STOP then bin/START) to load any code changes.", DIM));
console.log("");
