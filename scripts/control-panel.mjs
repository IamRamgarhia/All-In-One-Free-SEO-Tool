/**
 * The control panel — one screen that installs, starts, stops, updates,
 * backs up and restores this tool, with buttons that actually do it.
 *
 * This is the whole product for anyone who does not live in a terminal:
 * one icon on the Desktop, one page, and nothing to remember. If you add
 * a button here, add the task behind it in the same commit —
 * src/lib/control-panel-contract.test.ts fails the build otherwise,
 * because a button that looks real and does nothing is the worst thing
 * this file can ship.
 *
 * WHY THIS ISN'T A PLAIN .html FILE IN THE ROOT FOLDER
 *
 * A double-clicked .html opens in the browser's file:// sandbox, which
 * cannot start a process, install anything, copy a file or read a
 * directory. Buttons in such a page would be decoration — they would
 * look like they worked and do nothing, which is the one failure mode
 * this codebase has spent the most effort removing.
 *
 * A .hta can run commands, but it is Windows-only and renders in
 * Internet Explorer's engine, so half the users get nothing and the
 * other half get a page from 2005.
 *
 * So: a small launcher starts this file, this file serves a real page to
 * the user's real browser, and the buttons POST back here, where there
 * is a shell to run things in.
 *
 * IT ORCHESTRATES, IT DOESN'T REIMPLEMENT
 *
 * bin/START.* and bin/STOP.* already handle package-manager detection,
 * first-run install, the production build, port selection, binding to
 * 127.0.0.1 so the LAN can't reach the app, pid tracking and waiting on
 * /api/v1/health. bin/seo-update.cjs and bin/seo-doctor.cjs already
 * exist too.
 *
 * The first draft of this file reimplemented all of that and got it
 * wrong in four places — it ran `start` instead of `start:daily` (so no
 * migrations), treated any `.next` directory as a finished build rather
 * than checking `.next/BUILD_ID`, ignored `.seo-port`, and dropped the
 * loopback binding. Calling the tested scripts is both less code and
 * the only version that is right.
 *
 * Zero dependencies, deliberately: this runs BEFORE `pnpm install` on a
 * freshly downloaded folder, so it may only use the Node standard
 * library.
 */

import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, sep } from "node:path";
import { homedir, platform } from "node:os";
import { createRequire } from "node:module";
import {
  DOCKER,
  NATIVE,
  UNKNOWN,
  detectInstallMode,
} from "./install-mode.mjs";
import { describeBackup } from "./backup-label.mjs";
import { resolveBackupDir } from "./backup-dir.mjs";
import {
  candidatePorts as portCandidates,
  healthMatches,
  samePath as pathsEqual,
} from "./app-port.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
// `let`, because the panel moves to the next port when something else
// holds this one — and the Origin check below has to compare against
// the port it actually got, not the one it hoped for.
let PORT = Number(process.env.SEO_PANEL_PORT ?? 4321);
const IS_WINDOWS = platform() === "win32";

/** One task at a time — two installs at once corrupts node_modules. */
let current = null;

/**
 * Terminal colour codes, stripped.
 *
 * bin/seo-doctor.cjs prints ANSI escapes for bold and colour, which a
 * terminal renders and a browser shows as literal `[1m` noise in the
 * middle of every heading. The panel is a web page, so the escapes are
 * removed rather than passed through.
 */
// The first character of this pattern is a literal ESC byte (0x1B),
// which most editors render as nothing. It must be there: without it
// the pattern matches any bracketed text, so ordinary output like
// "[abc]" would silently lose its "[a".
const ANSI = /\[[0-9;]*[A-Za-z]/g;

function log(line) {
  if (!current) return;
  for (const l of String(line).replace(ANSI, "").split(/\r?\n/)) {
    if (l.trim()) current.lines.push(l);
  }
  if (current.lines.length > 3000) {
    current.lines.splice(0, current.lines.length - 3000);
  }
}

function readTextIfPresent(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

function which(cmd) {
  return new Promise((resolve) => {
    execFile(IS_WINDOWS ? "where" : "which", [cmd], (err, stdout) =>
      resolve(err ? null : String(stdout).split(/\r?\n/)[0].trim() || null),
    );
  });
}

/**
 * Where backups actually live.
 *
 * Two things write them and they used to disagree. The app's own
 * scheduler (src/lib/auto-backup.ts) writes `data.db.bak-<ISO>` next to
 * the database, in the data dir; this panel wrote `backups/data-*.db`.
 * So the panel reported "Backups: none yet" on an install that had a
 * week of daily backups sitting beside data.db — a wrong answer about
 * the one thing you check before trusting an update.
 *
 * Both shapes are listed now, newest first, and a backup taken here
 * lands where the app already puts them so retention prunes them too.
 */
function dataDirPath() {
  return process.env.SEO_DATA_DIR ?? ROOT;
}

function dbFilePath() {
  return process.env.SEO_DB_PATH ?? join(ROOT, "data.db");
}

/**
 * The two places a backup can be, as named buckets.
 *
 * An id is `<bucket>/<filename>` and nothing else — never a path. A
 * path relative to ROOT would be `../../data/...` the moment the data
 * dir moves (Docker mounts it at /data), and a path from the browser is
 * a directory-traversal hole waiting to be found. The bucket is looked
 * up here and the filename is checked for separators.
 */
const BACKUP_BUCKETS = {
  // Where routine backups go now: out of the app folder, so deleting,
  // moving or re-downloading the app does not take every copy of the
  // database with it. See scripts/backup-dir.mjs.
  home: () => backupDirPath(),
  // Where they used to go — beside the database. Still listed, or an
  // existing install's backups would disappear from this screen the day
  // it updates.
  data: () => dataDirPath(),
  backups: () => join(ROOT, "backups"),
};

/** The same rule the app uses, so the two never disagree. */
function backupDirPath() {
  return resolveBackupDir(process.env, dataDirPath(), homedir(), platform(), sep);
}

function listBackups() {
  const dbName = basename(dbFilePath());
  const found = [];
  // The buckets are policies, not necessarily distinct folders: on
  // Docker, and whenever SEO_DATA_DIR is set, "home" and "data" resolve
  // to the same place. Scanning both would list every backup twice,
  // under two different ids, which looks like duplicate files.
  const seenDirs = new Set();
  const scan = (bucket, match) => {
    const dir = BACKUP_BUCKETS[bucket]();
    if (seenDirs.has(dir)) return;
    seenDirs.add(dir);
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const f of entries) {
      if (!match(f)) continue;
      try {
        const s = statSync(join(dir, f));
        if (!s.isFile()) continue;
        // kind/detail say what the backup IS. The dropdown used to show
        // the filename and nothing else, which answers a question
        // nobody asked and not the one they did.
        const { kind, detail } = describeBackup(bucket, f);
        found.push({
          id: `${bucket}/${f}`,
          name: f,
          kind,
          detail,
          sizeMb: Math.round((s.size / 1024 / 1024) * 10) / 10,
          when: s.mtime.toISOString(),
        });
      } catch {
        /* skip */
      }
    }
  };
  scan("home", (f) => f.startsWith(`${dbName}.bak-`));
  scan("data", (f) => f.startsWith(`${dbName}.bak-`));
  scan("backups", (f) => f.endsWith(".db"));
  return found.sort((a, b) => (a.when < b.when ? 1 : -1));
}

/** An id from the browser → a real path, or null. Never trusts the input. */
function resolveBackup(id) {
  const entry = listBackups().find((b) => b.id === id);
  if (!entry) return null;
  const [bucket, ...rest] = entry.id.split("/");
  const name = rest.join("/");
  // Belt and braces: the name came from readdirSync, so it cannot
  // contain a separator — assert it rather than assume it.
  if (!BACKUP_BUCKETS[bucket] || name.includes("/") || name.includes("\\")) {
    return null;
  }
  return { ...entry, path: join(BACKUP_BUCKETS[bucket](), name) };
}

/**
 * Is this folder run by Docker Compose rather than natively?
 *
 * It matters because every button here drives bin/START.* and bin/STOP.*,
 * which install Node modules and run `next start` in this folder. Press
 * Start on a Docker install and you get a second copy of the app running
 * beside the container, both pointed at different databases — the
 * container's volume and a fresh local data.db. Nothing would error.
 *
 * So the panel asks first, and refuses rather than doing the wrong thing.
 * `-a` because a stopped container is still a Docker install, and that is
 * exactly when someone comes here looking for a Start button.
 */
/** Cached {mode, why} from installMode(), not a boolean. */
let dockerCheck = { at: 0, value: null };

function execCapped(cmd, args, ms) {
  return new Promise((resolve) => {
    try {
      execFile(
        cmd,
        args,
        { cwd: ROOT, timeout: ms, windowsHide: true },
        (err, stdout) => resolve(err ? null : String(stdout)),
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Which kind of install this is, as one of three answers.
 *
 * The decision itself lives in install-mode.mjs so it can be tested
 * without Docker; this supplies the three things that touch the machine
 * and caches the result. UNKNOWN is why it is no longer a boolean — see
 * that file. Previously "could not tell" and "not Docker" were the same
 * value, and that value took the native path.
 */
/**
 * Where an answer given in the panel is kept.
 *
 * Beside the other per-install runtime state (`.seo-port`,
 * `.seo-encryption-key`), and gitignored with them. It holds one word.
 */
const MODE_FILE = join(ROOT, ".seo-install-mode");

async function installMode() {
  // State is polled every few seconds; shelling out to Docker that often
  // would make the page crawl when Docker Desktop is slow to answer.
  if (Date.now() - dockerCheck.at < 30_000) return dockerCheck.value;
  const result = await detectInstallMode({
    env: process.env,
    savedMode: () => readTextIfPresent(MODE_FILE),
    hasComposeFile: () => existsSync(join(ROOT, "docker-compose.yml")),
    hasDockerBin: async () => Boolean(await which("docker")),
    composePs: () =>
      execCapped("docker", ["compose", "ps", "-a", "--format", "json"], 6000),
    // Only consulted when the daemon stays silent. docker-compose.yml
    // mounts a named volume and points SEO_DB_PATH at /data/data.db, so
    // a Docker install never writes a data.db here; one in this folder
    // means this install has run natively. See install-mode.mjs.
    nativeEvidence: () =>
      existsSync(join(ROOT, "data.db")) ? "data.db is in this folder" : null,
  });
  dockerCheck = { at: Date.now(), value: result };
  return result;
}

/**
 * Record the user's answer, and act on it immediately.
 *
 * Returns false for anything that is not one of the two words, so a
 * malformed request cannot write a file that makes every later
 * detection ambiguous.
 */
function rememberInstallMode(mode) {
  if (mode !== DOCKER && mode !== NATIVE) return false;
  writeFileSync(MODE_FILE, `${mode}\n`, "utf8");
  // Drop the cache, or the page keeps showing the question for up to 30
  // seconds after it was answered and looks like it ignored the click.
  dockerCheck = { at: 0, value: null };
  return true;
}

async function isDockerInstall() {
  return (await installMode()).mode === DOCKER;
}

/** Refuse a native action on a Docker install, and say what to do instead. */
function refuseOnDocker(action, command) {
  log(`This install runs in Docker, so "${action}" here would not do what`);
  log("you expect — it would start a second copy beside the container,");
  log("with its own separate database.");
  log("");
  log("Run this instead, from this folder:");
  log(`    ${command}`);
  log("");
  log("Backups live inside the app for Docker installs: open it and go to");
  log("Settings -> Backup.");
  return false;
}

/**
 * Refuse a native action when we could not establish that this is a
 * native install.
 *
 * The old code could not reach this state: "could not tell" was the same
 * boolean as "not Docker", and that took the native path — so a Docker
 * install whose daemon was simply not running got a second app started
 * against an empty database, and a success message. Doing nothing and
 * saying why is the only safe answer to a question we failed to ask.
 */
function refuseUnknownInstall(action, why) {
  log(`"${action}" is not safe to run until it is clear how this install`);
  log("is set up, so nothing has been changed.");
  log("");
  log(`Why: ${why}`);
  log("");
  log("If this app runs in Docker, running it natively as well would");
  log("start a second copy against a different, empty database — and it");
  log("would look like it worked.");
  return false;
}

/**
 * Guard for every task that drives bin/START.* and the local data.db.
 *
 * Returns true when it has refused and logged the reason, in which case
 * the caller must do nothing.
 */
async function refuseUnlessNative(action, command) {
  const { mode, why } = await installMode();
  if (mode === DOCKER) {
    refuseOnDocker(action, command);
    return true;
  }
  if (mode === UNKNOWN) {
    refuseUnknownInstall(action, why);
    return true;
  }
  return false;
}

/**
 * Ports the app might be on, best guess first.
 *
 * `.seo-port` is what bin/START.* wrote the last time IT started the
 * app, which is not the same as where the app is now. Measured on this
 * machine 30 Oct 2026: the file said 3399 while a healthy app answered
 * on 3000, because that run had been started directly rather than
 * through the launcher. The panel believed the file, reported "Installed,
 * not running" over a running app, and pointed "Open the app" at a dead
 * port — a confident wrong answer, which is the failure mode this
 * project treats as worse than a crash.
 *
 * So the file is a hint to try first, not the answer.
 */
function candidatePorts() {
  return portCandidates(readTextIfPresent(join(ROOT, ".seo-port")), process.env.PORT);
}

/**
 * Is THIS install's app answering, and where?
 *
 * The health endpoint reports `service` and `installRoot`, so a stranger
 * on port 3000 — another project's dev server, which is the single most
 * contended port there is — cannot be mistaken for ours and have the
 * Stop button aimed at it.
 *
 * A field that is absent is not treated as a mismatch: an older build of
 * the app predates `installRoot`, and refusing to see it would turn one
 * wrong answer into another.
 */
async function probeHealth(port) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1500);
    const res = await fetch(`http://localhost:${port}/api/v1/health`, {
      signal: c.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return healthMatches(body, ROOT, IS_WINDOWS) ? body : null;
  } catch {
    return null;
  }
}

/** Two spellings of one path — see scripts/app-port.mjs. */
function samePath(a, b) {
  return pathsEqual(a, b, IS_WINDOWS);
}

/** Ask the app itself, rather than trusting a file that may be stale. */
async function findRunningApp() {
  for (const port of candidatePorts()) {
    if (await probeHealth(port)) return port;
  }
  return null;
}

async function readState() {
  const dbPath = process.env.SEO_DB_PATH ?? join(ROOT, "data.db");
  const hasData = existsSync(dbPath);

  let version = "unknown";
  try {
    version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  } catch {
    /* fine */
  }

  const runningOn = await findRunningApp();

  return {
    nodeVersion: process.versions.node,
    hasGit: Boolean(await which("git")),
    installed: existsSync(join(ROOT, "node_modules")),
    // BUILD_ID, not the directory: `.next` exists after a failed build
    // too, and bin/START.* uses this same file to decide prod vs dev.
    built: existsSync(join(ROOT, ".next", "BUILD_ID")),
    hasData,
    dataSizeMb: hasData
      ? Math.round((statSync(dbPath).size / 1024 / 1024) * 10) / 10
      : 0,
    backups: listBackups(),
    dockerInstall: await isDockerInstall(),
    // Three states, not two. "Could not tell" used to be reported as
    // "not Docker", and every button then took the native path.
    installMode: (await installMode()).mode,
    installModeWhy: (await installMode()).why,
    // Whether that mode was concluded from local evidence rather than
    // from Docker itself, and whether it came from an answer given here.
    // The page says which, because "native" deduced from a file on disk
    // is not the same claim as "native" confirmed by the daemon.
    installModeInferred: Boolean((await installMode()).inferred),
    installModeSaved: Boolean((await installMode()).saved),
    // One probe, used for both — so "Running" and the port the Open
    // button uses can never disagree with each other.
    running: runningOn !== null,
    appPort: runningOn ?? candidatePorts()[0],
    version,
    root: ROOT,
    busy: current && !current.done ? current.name : null,
  };
}

/** Run a command, streaming output into the current task's log. */
function runStep(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    log(`\n> ${cmd} ${args.join(" ")}`);
    let child;
    try {
      // shell: false. Node 24 deprecates passing args with shell: true,
      // because the shell concatenates them without escaping — a path
      // containing a space or an ampersand becomes a second command.
      // Every call here names its interpreter explicitly (cmd /c, bash,
      // node), so no shell is needed.
      child = spawn(cmd, args, {
        cwd: ROOT,
        shell: false,
        env: { ...process.env, ...opts.env },
      });
    } catch (e) {
      log(`Could not run ${cmd}: ${e.message}`);
      return resolve(false);
    }
    // Explicit utf8: these scripts print box-drawing characters, and on
    // Windows a pipe read with the wrong encoding turns them to mojibake.
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (d) => log(d));
    child.stderr?.on("data", (d) => log(d));
    child.on("error", (e) => {
      log(`Could not run ${cmd}: ${e.message}`);
      resolve(false);
    });
    child.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Copy the database to `dest`, as consistently as this machine allows.
 *
 * Extracted so the Update button can take a snapshot before it runs
 * migrations, using the same code path as the Back up button rather
 * than a second, slightly different copy of it — this codebase has been
 * bitten by every such pair it has grown.
 */
async function snapshotDatabase(dbPath, dest) {
  try {
    const require = createRequire(import.meta.url);
    const Database = require("better-sqlite3");
    const sqlite = new Database(dbPath, { readonly: true });
    try {
      // VACUUM INTO writes a fresh, fully-checkpointed copy and works
      // while the app is running, without blocking it.
      sqlite.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
      log("Took a consistent snapshot with SQLite (VACUUM INTO).");
      return true;
    } finally {
      sqlite.close();
    }
  } catch (e) {
    log(`SQLite snapshot unavailable (${e.message.split("\n")[0]}).`);
  }

  // Last resort, and honest about what it is. The -wal file holds
  // committed data that data.db does not, so it has to come too or the
  // backup is quietly incomplete.
  if ((await findRunningApp()) !== null) {
    log("The app is running and SQLite isn't available here, so this");
    log("is a plain file copy — press Stop first for a clean one.");
  }
  copyFileSync(dbPath, dest);
  log("> copied data.db");
  for (const suffix of ["-wal", "-shm"]) {
    if (existsSync(dbPath + suffix)) {
      copyFileSync(dbPath + suffix, dest + suffix);
      log(`> copied data.db${suffix} (it holds data the main file doesn't)`);
    }
  }
  return true;
}

/**
 * The safety copy taken before an update.
 *
 * Goes to `backups/`, not beside the database, for two reasons. It is
 * the bucket `describeBackup` renders as "safety copy, taken before …"
 * rather than "routine backup", so the restore dropdown says what this
 * one is for. And it is not the directory an update rewrites.
 *
 * Returns false only when there is a database and it could not be
 * copied. No database at all is a fresh install with nothing to lose,
 * which must not block the update.
 */
async function snapshotBeforeUpdate() {
  const dbPath = dbFilePath();
  if (!existsSync(dbPath)) {
    log("No database yet, so there is nothing to protect — updating.");
    return true;
  }

  const version = (() => {
    try {
      return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
    } catch {
      return "unknown";
    }
  })();
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = BACKUP_BUCKETS.backups();
  const dest = join(dir, `data-before-update-from-v${version}-${stamp}.db`);

  try {
    mkdirSync(dir, { recursive: true });
    // Re-running an update on the same day must not fail on an existing
    // file, and must not silently keep the older copy either: the point
    // is a snapshot of the state this update is about to change.
    rmSync(dest, { force: true });
    await snapshotDatabase(dbPath, dest);
    const mb = Math.round((statSync(dest).size / 1024 / 1024) * 10) / 10;
    log(`Safety copy saved: ${basename(dest)} (${mb} MB)`);
    log(`in ${dir}`);
    log("Restore it from this screen if the update goes wrong.\n");
    return true;
  } catch (e) {
    log(`Could not take a safety copy: ${e.message.split("\n")[0]}`);
    return false;
  }
}

/** The platform's launcher script in bin/. */
function binScript(name) {
  return IS_WINDOWS ? join(ROOT, "bin", `${name}.cmd`) : join(ROOT, "bin", `${name}.sh`);
}

function runBin(name) {
  const script = binScript(name);
  if (!existsSync(script)) {
    log(`Missing ${script} — this install looks incomplete.`);
    return Promise.resolve(false);
  }
  // Tell the script nobody is watching. bin/START.cmd pauses for a
  // keypress on failure, which is right in a terminal and fatal here —
  // the panel has no stdin, so the task would sit "working" forever
  // instead of reporting what went wrong.
  const env = { SEO_NONINTERACTIVE: "1" };
  return IS_WINDOWS
    ? runStep("cmd", ["/c", script], { env })
    : runStep("bash", [script], { env });
}

/**
 * Put a shortcut on the Desktop, so there is exactly one way to reopen
 * this and it isn't "find the folder you unzipped".
 *
 * install.ps1 and install.sh already do this, but only for people who
 * ran the one-line installer. Anyone who downloaded the zip from GitHub
 * and double-clicked the launcher got nothing — so "how do I start it
 * again?" had two different answers depending on how you arrived. It
 * has one now.
 *
 * Best-effort: a failure here is not worth failing an install over, so
 * it says what happened and moves on.
 */
async function addDesktopShortcut() {
  const desktop = join(homedir(), "Desktop");
  if (!existsSync(desktop)) {
    log("No Desktop folder found — skipping the shortcut.");
    return true;
  }

  try {
    if (IS_WINDOWS) {
      const target = join(ROOT, "SEO Tool.cmd");
      const link = join(desktop, "SEO Tool.lnk");
      const icon = join(ROOT, "public", "icon.ico");
      // WScript.Shell via PowerShell — the only way to write a real
      // .lnk without a native module.
      const ps = [
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:SEO_LINK)",
        "$s.TargetPath = $env:SEO_TARGET",
        "$s.WorkingDirectory = $env:SEO_ROOT",
        "$s.Description = 'Open the SEO Tool control panel'",
        "if (Test-Path $env:SEO_ICON) { $s.IconLocation = $env:SEO_ICON }",
        "$s.Save()",
      ].join("; ");
      const ok = await runStep(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", ps],
        { env: { SEO_LINK: link, SEO_TARGET: target, SEO_ROOT: ROOT, SEO_ICON: icon } },
      );
      if (ok) log(`\nAdded "SEO Tool" to your Desktop.`);
      return ok;
    }

    const target = join(ROOT, "SEO Tool.command");
    if (platform() === "darwin") {
      // A symlink, not a copy: it keeps pointing at the real launcher
      // after an update, where a copy would go stale.
      await runStep("ln", ["-sf", target, join(desktop, "SEO Tool.command")]);
      log(`\nAdded "SEO Tool" to your Desktop.`);
      return true;
    }

    // Linux file managers won't launch a bare symlink; they want a
    // .desktop entry, and GNOME won't run one it doesn't trust.
    const entry = join(desktop, "SEO-Tool.desktop");
    writeFileSync(
      entry,
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=SEO Tool",
        "Comment=Open the SEO Tool control panel",
        `Exec=bash "${target}"`,
        `Path=${ROOT}`,
        `Icon=${join(ROOT, "public", "icon.ico")}`,
        "Terminal=true",
        "Categories=Development;Utility;",
        "",
      ].join("\n"),
      "utf8",
    );
    await runStep("chmod", ["+x", entry]);
    await runStep("gio", ["set", entry, "metadata::trusted", "true"]);
    log(`\nAdded "SEO Tool" to your Desktop.`);
    return true;
  } catch (e) {
    log(`\nCouldn't add the Desktop shortcut: ${e.message}`);
    log("Not a problem — reopen this by double-clicking the launcher in");
    log(ROOT);
    return true;
  }
}

const TASKS = {
  // START.* installs, builds and starts, in that order, skipping
  // whatever is already done. So "Install" and "Start" are the same
  // script — the difference is only what the user is told to expect.
  install: async () => {
    if (await refuseUnlessNative("Install", "docker compose up -d")) return false;
    const ok = await runBin("START");
    // Only on success: a Desktop icon pointing at a half-built install
    // is worse than none.
    if (ok) await addDesktopShortcut();
    return ok;
  },
  start: async () =>
    (await refuseUnlessNative("Start", "docker compose up -d"))
      ? false
      : runBin("START"),
  stop: async () =>
    (await refuseUnlessNative("Stop", "docker compose down"))
      ? false
      : runBin("STOP"),
  shortcut: () => addDesktopShortcut(),

  update: async () => {
    if (
      await refuseUnlessNative(
        "Update",
        "git pull && docker compose up -d --build",
      )
    )
      return false;
    /**
     * Two kinds of install, two updaters.
     *
     * A git checkout pulls commits. A zip install replaces files from
     * the latest GitHub release. Until seo-update-zip.mjs existed, the
     * second one simply refused — "not a git repository (ZIP installer
     * was used)" — and told the user to re-run a curl one-liner, which
     * is not an instruction for someone whose whole interface is this
     * page. The headline install could never be updated.
     */
    const isGitCheckout = existsSync(join(ROOT, ".git"));
    if (isGitCheckout && !(await which("git"))) {
      log("This is a git checkout but git isn't installed, so the code");
      log("can't update itself. Install git, or download the latest zip");
      log("from GitHub and keep your data.db file — that's where");
      log("everything lives.");
      return false;
    }

    // Snapshot the database BEFORE anything is changed.
    //
    // An update runs migrations, and a SQLite migration that adds a
    // constraint does it by rebuilding the table — which drops that
    // table's indexes and, if foreign keys are enforced wrongly, can
    // delete child rows while reporting success. That is not
    // hypothetical here; it is written up in this project's own notes
    // and guarded by src/db/migration-fk-safety.test.ts.
    //
    // There is already a Back up button, and nothing makes anyone press
    // it before the one action that rewrites their schema. So press it
    // for them. It costs a second and a few MB.
    if (!(await snapshotBeforeUpdate())) {
      log("Stopping here rather than updating without a safety copy.");
      log("Press Back up to see the error in full.");
      return false;
    }

    if (isGitCheckout) {
      return runStep("node", [join(ROOT, "bin", "seo-update.cjs")]);
    }

    // A zip update replaces files on disk, including .next and the
    // server's own source. Do it with the app stopped: on Windows a
    // running node.exe holds those files open and the copy fails
    // halfway, which is the worst possible moment to stop.
    if ((await findRunningApp()) !== null) {
      log("Stopping the app first, so its files aren't locked…");
      await runBin("STOP");
    }
    return runStep("node", [join(ROOT, "bin", "seo-update-zip.mjs")]);
  },

  doctor: () => runStep("node", [join(ROOT, "bin", "seo-doctor.cjs")]),

  /**
   * Install the headless browser, without a terminal.
   *
   * Rank checks, SERP scraping and screenshots need Chromium. Setup
   * downloads it, but that step used to end in `2>nul` with no exit
   * check, so a failed download was invisible and setup still said
   * "complete". The person then met this, mid-task:
   *
   *   "The headless browser isn't installed yet. Run
   *    `npx playwright install chromium` in the tool's folder"
   *
   * Which is a terminal instruction, to somebody who installed this by
   * double-clicking an icon precisely so they would not need one.
   * Reported as issue #37.
   */
  async browser() {
    if (
      await refuseUnlessNative(
        "Install the headless browser",
        "docker compose exec seo npx playwright install chromium",
      )
    )
      return false;
    if (!existsSync(join(ROOT, "node_modules"))) {
      log("Nothing is installed yet — press Set up first.");
      return false;
    }

    log("Downloading Chromium (about 170 MB). This takes a minute or two.");
    log("");
    // runStep's own rule: name the interpreter. On Windows `npx` is
    // npx.cmd, and spawn without a shell cannot launch a .cmd — the
    // first version of this failed with "spawn npx ENOENT" and then
    // blamed the user's internet connection.
    const ok = IS_WINDOWS
      ? await runStep("cmd", ["/c", "npx", "--yes", "playwright", "install", "chromium"], {
          cwd: ROOT,
        })
      : await runStep("npx", ["--yes", "playwright", "install", "chromium"], {
          cwd: ROOT,
        });

    if (!ok) {
      log("");
      log("That did not work. The usual causes, in order:");
      log("  - no internet, or a proxy that blocks the download");
      log("  - antivirus holding the file while it is being written");
      log("  - a full disk (it needs about 400 MB free)");
      log("");
      log("Everything except rank checks, SERP scraping and screenshots");
      log("works without it — audits and content tools are unaffected.");
      return false;
    }

    log("");
    log("Done. Rank checks and SERP scraping will work now.");
    return true;
  },

  /**
   * A backup you can actually restore from.
   *
   * This used to prefer the `sqlite3` CLI and fall back to copying
   * data.db. On Windows that fallback is the normal path — sqlite3 is
   * not installed — and copying data.db in WAL mode leaves behind
   * every committed page still sitting in data.db-wal. Measured on the
   * machine this was written on: 119 KB of real data outside the file
   * being copied, while the log said "fine for everyday use".
   *
   * better-sqlite3 is already installed (the app cannot run without
   * it), and VACUUM INTO is exactly what the app's own /api/backup and
   * nightly auto-backup use. Use the same thing, so a backup made here
   * and a backup made by the app are the same kind of file.
   */
  async backup() {
    const backupMode = await installMode();
    if (backupMode.mode === DOCKER) {
      log("This install keeps its data in a Docker volume, which this");
      log("panel cannot reach from outside the container.");
      log("");
      log("Open the app and use Settings -> Backup. It takes the same");
      log("kind of snapshot, from inside, where the database actually is.");
      return false;
    }
    // The worst place to guess. If this is a Docker install, the local
    // data.db is not the live one, so a "backup" here would snapshot an
    // empty or stale file and report success — and the person reading
    // that line would believe their data was saved. This panel has
    // already shipped one bug of exactly that shape.
    if (backupMode.mode === UNKNOWN) {
      return refuseUnknownInstall("Back up", backupMode.why);
    }
    const dbPath = dbFilePath();
    if (!existsSync(dbPath)) {
      log("No data.db yet — there's nothing to back up.");
      return false;
    }

    // Name the file and when it last changed, always.
    //
    // This is the one task where being wrong about the install mode is
    // silent and expensive, and the mode can now be concluded from local
    // evidence rather than from Docker itself (see install-mode.mjs).
    // Someone who moved a native install into Docker and then stopped
    // Docker would get that conclusion — so print what was actually
    // copied. A last-changed date from months ago is the tell, and it is
    // visible before they rely on the backup rather than after.
    log(`Backing up ${dbPath}`);
    log(`last changed ${statSync(dbPath).mtime.toLocaleString()}`);
    if (backupMode.inferred) {
      log("");
      log("Note: Docker is installed on this machine and did not answer,");
      log(`so this was treated as a native install — ${backupMode.evidence}.`);
      log("If the app really runs in Docker, back up from inside it");
      log("instead: Settings -> Backup.");
    }
    log("");

    // Same directory and naming as src/lib/auto-backup.ts, so the app's
    // retention pruning sees these too and there is one place to look.
    const dir = backupDirPath();
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+$/, "Z");
    const name = `${basename(dbPath)}.bak-${stamp}`;
    const dest = join(dir, name);

    await snapshotDatabase(dbPath, dest);

    const mb = Math.round((statSync(dest).size / 1024 / 1024) * 10) / 10;
    log(`\nSaved ${name} (${mb} MB)`);
    log(`in ${dir}`);
    log("\nRestore it from this same screen if you ever need to go back.");
    return true;
  },

  /**
   * Put a backup back. The one destructive button here, so: the app is
   * stopped first, the current database is copied aside before anything
   * is overwritten, and the stale -wal/-shm are removed — a WAL from
   * one database against another is how you corrupt both.
   */
  async restore(id) {
    const restoreMode = await installMode();
    if (restoreMode.mode === DOCKER) {
      log("Restoring into a Docker volume has to happen from inside the");
      log("container. Open the app and use Settings -> Backup.");
      return false;
    }
    if (restoreMode.mode === UNKNOWN) {
      return refuseUnknownInstall("Restore", restoreMode.why);
    }
    // Never resolve a path the browser sent — only an entry already in
    // the list, matched exactly, with its directory decided here.
    const choice = resolveBackup(id);
    if (!choice) {
      log("That backup isn't in the list any more. Refresh and try again.");
      return false;
    }

    const dbPath = dbFilePath();
    const source = choice.path;

    if ((await findRunningApp()) !== null) {
      log("Stopping the app first…");
      await runBin("STOP");
    }

    if (existsSync(dbPath)) {
      const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+$/, "Z");
      const aside = join(dataDirPath(), `${basename(dbPath)}.before-restore-${stamp}`);
      copyFileSync(dbPath, aside);
      log(`Copied your current data aside as ${basename(aside)}`);
      log("so this is undoable if you restore the wrong one.");
    }

    copyFileSync(source, dbPath);
    log(`Restored ${choice.name}`);

    for (const suffix of ["-wal", "-shm"]) {
      const stale = dbPath + suffix;
      const fromBackup = source + suffix;
      try {
        if (existsSync(fromBackup)) {
          copyFileSync(fromBackup, stale);
          log(`> restored data.db${suffix} from the same backup`);
        } else if (existsSync(stale)) {
          rmSync(stale, { force: true });
          log(`> removed the old data.db${suffix} (it belongs to the replaced database)`);
        }
      } catch (e) {
        log(`Could not clear data.db${suffix}: ${e.message}`);
      }
    }

    log("\nDone. Press Start to bring the app back up.");
    return true;
  },
};

async function startTask(name, arg) {
  if (current && !current.done) return false;
  const fn = TASKS[name];
  if (!fn) return false;
  current = { name, lines: [], done: false, ok: false };
  void (async () => {
    let ok = false;
    try {
      ok = await fn(arg);
    } catch (e) {
      log(`\nSomething went wrong: ${e.message}`);
    }
    current.ok = ok;
    current.done = true;
  })();
  return true;
}

// ---------------------------------------------------------------- http

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, body, type = "application/json") => {
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(code, {
      "content-type": type,
      "cache-control": "no-store",
      "x-frame-options": "DENY",
    });
    res.end(payload);
  };

  // This panel runs shell commands, so anything with a foreign Origin
  // is refused. Without it, any website open in the same browser could
  // POST here and start installing things.
  const origin = req.headers.origin;
  if (
    origin &&
    origin !== `http://localhost:${PORT}` &&
    origin !== `http://127.0.0.1:${PORT}`
  ) {
    return send(403, { error: "This panel only accepts requests from itself." });
  }

  if (url.pathname === "/") {
    return send(
      200,
      readFileSync(join(HERE, "control-panel.html"), "utf8"),
      "text/html; charset=utf-8",
    );
  }

  /**
   * Cheap "are you a panel, and whose?" probe.
   *
   * Separate from /api/state because that one can take seconds: it
   * shells out to `docker compose ps` with a 6s cap. The launcher uses
   * this to decide whether a panel is already open on this port, and a
   * slow answer there means a second panel opens on the next port
   * instead of joining the first — measured on this machine, which has
   * Docker installed.
   */
  if (url.pathname === "/api/ping") {
    return send(200, { panel: true, root: ROOT });
  }

  if (url.pathname === "/api/state") return send(200, await readState());

  if (url.pathname === "/api/log") {
    const since = Number(url.searchParams.get("since") ?? 0);
    if (!current) {
      return send(200, { lines: [], next: 0, done: true, ok: true, name: null });
    }
    return send(200, {
      name: current.name,
      lines: current.lines.slice(since),
      next: current.lines.length,
      done: current.done,
      ok: current.ok,
    });
  }

  // Answer the "is this Docker or native?" question from the page.
  //
  // Without this the UNKNOWN state is a dead end: the banner explains
  // why every button is holding off and the only way out is an
  // environment variable, which is not an instruction for someone whose
  // whole interface is this page.
  if (req.method === "POST" && url.pathname === "/api/install-mode") {
    const mode = url.searchParams.get("mode");
    if (!rememberInstallMode(mode)) {
      return send(400, { ok: false, error: 'mode must be "docker" or "native"' });
    }
    return send(200, { ok: true, mode });
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/run/")) {
    const task = url.pathname.slice("/api/run/".length);
    const started = await startTask(task, url.searchParams.get("file") ?? undefined);
    // Saying "started: false" is not enough on its own — the page used
    // to ignore it and sit on "Working…" forever. It reports the reason
    // now, and the page shows it.
    return send(200, {
      started,
      reason: started
        ? null
        : current && !current.done
          ? `Already running: ${current.name}`
          : `Unknown action: ${task}`,
    });
  }

  send(404, { error: "not found" });
});

/** Open a URL in the user's default browser. */
function openInBrowser(url) {
  // `start` is a cmd builtin, so it needs cmd — but explicitly, not via
  // shell: true, which would concatenate unescaped. The empty "" is
  // start's title argument; without it a quoted URL becomes the title
  // and nothing opens.
  const [opener, openerArgs] = IS_WINDOWS
    ? ["cmd", ["/c", "start", "", url]]
    : platform() === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  try {
    spawn(opener, openerArgs, { stdio: "ignore", detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

/** Is the thing already on this port our own panel, or a stranger? */
async function panelAlreadyOn(port) {
  try {
    const c = new AbortController();
    // /api/ping, not /api/state: state shells out to Docker and can
    // take seconds, and a probe that times out reports "no panel here"
    // — so the launcher would open a second one on the next port rather
    // than joining the one already running.
    const t = setTimeout(() => c.abort(), 2000);
    const res = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: c.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    // Matching on the root as well as the flag, so two different
    // checkouts on neighbouring ports do not adopt each other's panel.
    return Boolean(body?.panel === true && samePath(body.root ?? "", ROOT));
  } catch {
    return false;
  }
}

/**
 * Start the panel, and land the user in it whatever is already running.
 *
 * Double-clicking the launcher a second time used to print "already
 * open — switch to that browser tab" and exit 1, which the .cmd turns
 * into a black window waiting on a keypress. For someone whose entire
 * interface is this page, pressing the one icon they have and getting a
 * console error is indistinguishable from the app being broken — and
 * the fix they need ("switch tabs") is being told to them in the window
 * they are being told to leave.
 *
 * So: if the panel is already up, open the browser at it and exit 0.
 * That is what they wanted. If something ELSE holds the port, move to
 * the next one rather than refusing — the port is ours by convention,
 * not by right.
 */
async function listenOrJoin(port, attemptsLeft = 12) {
  // Every retry reuses one server object, and `server.listen(p, h, cb)`
  // registers cb as a one-time "listening" listener that a FAILED
  // listen never consumes. Leave it there and the next attempt's
  // success fires the previous attempt's callback too — measured: bound
  // to 4401 and announced 4400, which is the URL the browser would then
  // be sent to. Clear both before each attempt.
  server.removeAllListeners("listening");
  server.removeAllListeners("error");

  if (await panelAlreadyOn(port)) {
    const url = `http://localhost:${port}`;
    console.log(`\n  The control panel is already open: ${url}`);
    console.log("  Bringing it to the front.\n");
    openInBrowser(url);
    process.exit(0);
  }

  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      // Not our panel, and not free. Someone else's server — take the
      // next port instead of dying on a convention.
      console.log(`  Port ${port} is taken by something else, trying ${port + 1}…`);
      void listenOrJoin(port + 1, attemptsLeft - 1);
      return;
    }
    console.error("\n  Couldn't start the control panel:", err.message, "\n");
    process.exit(1);
  });

  // 127.0.0.1, not 0.0.0.0. This endpoint can run commands, so it must
  // never be reachable from the network — the same decision bin/START.*
  // makes for the app itself.
  server.listen(port, "127.0.0.1", () => {
    PORT = port;
    const url = `http://localhost:${port}`;
    console.log(`\n  SEO Tool control panel: ${url}`);
    console.log("  Leave this window open — closing it closes the panel.\n");
    if (!openInBrowser(url)) console.log(`  Open ${url} in your browser.`);
  });
}

void listenOrJoin(PORT);
