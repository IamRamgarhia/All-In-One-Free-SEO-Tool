#!/usr/bin/env node
/**
 * Prints the running app's PID and port, for the shell launchers.
 *
 * WHY: `bin/STOP.sh` had its own answer to "where is the app" —
 * `.dev-server.pid`, then `.seo-port`, then `lsof`. Git Bash on Windows
 * has no `lsof`, so that last fallback was skipped entirely and the
 * script reported:
 *
 *     No running SEO Tool was found (nothing to stop).
 *
 * while PID 7524 was serving :3000 with this install's own
 * `installRoot`. Measured 19 Nov 2026. The same wrong answer the
 * control panel used to give, in a second copy, for the same reason:
 * a file records where START last PUT the app, not where it is.
 *
 * The app's health endpoint reports its own `pid`, so this needs no
 * netstat parsing, no lsof and no platform branch — it asks the app.
 *
 * Output, one line, for `$(...)` in a shell script:
 *
 *     3000 7524          found, ours
 *     (nothing)          not running, or not this install
 *
 * Exit 0 when found, 1 when not — so a caller can tell "no app" from
 * "could not look", which is the distinction `bin/STOP.sh` got wrong.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRunningApp } from "./app-port.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readIfPresent(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

const found = await findRunningApp({
  root: ROOT,
  remembered: readIfPresent(join(ROOT, ".seo-port")),
  envPort: process.env.PORT,
});

if (!found) process.exit(1);
process.stdout.write(`${found.port} ${found.pid ?? ""}\n`.trimEnd() + "\n");
