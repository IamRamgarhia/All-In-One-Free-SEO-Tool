#!/usr/bin/env node
/**
 * Delete private directories from .next/standalone after a build.
 *
 * WHY THIS IS A SCRIPT AND NOT A CONFIG SETTING
 *
 * next.config.ts sets outputFileTracingExcludes for all of these. It was
 * measured on 19 Nov 2026, twice, with both `./dir/**` and `**` + `/dir/**`
 * forms: `.git` was excluded, `backups`, `dist` and `e2e` were not. The
 * tracer decides what those globs mean and two of them silently did not
 * match. A config option that works for some entries and not others is
 * worse than none, because the ones that work make you stop checking.
 *
 * What was in there: seven copies of the live SQLite database, which
 * holds every client, keyword, audit and settings row including API keys.
 * The Dockerfile copies .next/standalone wholesale and the installer
 * payload is cut from it, so anything left here reaches end users.
 *
 * This runs as part of `build`, so it is not possible to produce a
 * standalone output that still has them. The excludes stay in the config
 * as a first line; this is the one that is actually relied on.
 *
 * It never touches files outside .next/standalone, and it is a no-op when
 * there is no standalone build.
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STANDALONE = join(ROOT, ".next", "standalone");

/**
 * Directories that must never be inside a build artefact.
 *
 * Only ones that can hold user data, repository history or previously
 * built archives. Source and docs are harmless, merely wasteful, and
 * deleting more than necessary risks removing something the server reads
 * at runtime — which would turn a privacy fix into an outage.
 */
const FORBIDDEN = [
  "backups", // copies of the live database
  ".git", // repository history
  ".e2e", // the end-to-end test database
  "dist", // previously built release archives and payloads
  "test-results",
  "playwright-report",
  // Agent instructions and local agent settings. `.claude/` can hold
  // `settings.local.json`, which is on this project's own list of files
  // that must never be committed. The file loop below skips
  // directories, so this has to be here rather than in FORBIDDEN_FILE.
  ".claude",
];

/**
 * Loose files at the top level that must not ship.
 *
 * `CLAUDE.md` / `AGENTS.md` were added 19 Nov 2026 after finding an
 * 81 KB `CLAUDE.md` sitting in `.next/standalone`. It is gitignored
 * precisely because it is not for distribution: this one holds the
 * maintainer's Windows paths, their clients' domain names and a running
 * list of what is and is not working on their install. The Dockerfile
 * copies this directory wholesale, so `docker compose up --build` on
 * any machine with one produces an image carrying it.
 *
 * Not a credential leak, which is why it survived the first pass of
 * this script — but a contributor's notes about their own employer's
 * sites have no business inside somebody else's download, and the
 * reason the file is gitignored applies with more force to a build
 * artefact than to a repository.
 */
const FORBIDDEN_FILE =
  /^(data\.db($|[-.])|\.env($|\..+)|CLAUDE\.md$|AGENTS\.md$)/;

if (!existsSync(STANDALONE)) {
  // Not a standalone build. Nothing to do, and not an error: `next build`
  // without output:"standalone" is a legitimate thing to run.
  process.exit(0);
}

const removed = [];

for (const name of FORBIDDEN) {
  const target = join(STANDALONE, name);
  if (!existsSync(target)) continue;
  let bytes = 0;
  const measure = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) measure(full);
      else
        try {
          bytes += statSync(full).size;
        } catch {
          /* advisory only */
        }
    }
  };
  try {
    measure(target);
  } catch {
    /* advisory only */
  }
  rmSync(target, { recursive: true, force: true });
  removed.push(`${name}/ (${Math.max(1, Math.round(bytes / 1024 / 1024))} MB)`);
}

for (const entry of readdirSync(STANDALONE, { withFileTypes: true })) {
  if (entry.isDirectory()) continue;
  if (!FORBIDDEN_FILE.test(entry.name)) continue;
  rmSync(join(STANDALONE, entry.name), { force: true });
  removed.push(entry.name);
}

if (removed.length > 0) {
  process.stdout.write(
    `  Pruned from .next/standalone: ${removed.join(", ")}\n`,
  );
}
