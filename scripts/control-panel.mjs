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
import { basename, dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PORT = Number(process.env.SEO_PANEL_PORT ?? 4321);
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
  data: () => dataDirPath(),
  backups: () => join(ROOT, "backups"),
};

function listBackups() {
  const dbName = basename(dbFilePath());
  const found = [];
  const scan = (bucket, match) => {
    const dir = BACKUP_BUCKETS[bucket]();
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
        found.push({
          id: `${bucket}/${f}`,
          name: f,
          sizeMb: Math.round((s.size / 1024 / 1024) * 10) / 10,
          when: s.mtime.toISOString(),
        });
      } catch {
        /* skip */
      }
    }
  };
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
let dockerCheck = { at: 0, value: false };

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

async function isDockerInstall() {
  // Detection is never perfect, so it can be overridden — the same rule
  // this project applies to tech-stack detection. Also the only way to
  // exercise the Docker branch on a machine without Docker:
  //   SEO_INSTALL_MODE=docker  (or native)
  const forced = String(process.env.SEO_INSTALL_MODE ?? "").toLowerCase();
  if (forced === "docker") return true;
  if (forced === "native") return false;

  // State is polled every few seconds; shelling out to Docker that often
  // would make the page crawl when Docker Desktop is slow to answer.
  if (Date.now() - dockerCheck.at < 30_000) return dockerCheck.value;
  let value = false;
  if (existsSync(join(ROOT, "docker-compose.yml")) && (await which("docker"))) {
    const out = await execCapped("docker", ["compose", "ps", "-a", "--format", "json"], 6000);
    value = Boolean(out && out.trim() && out.includes("seo"));
  }
  dockerCheck = { at: Date.now(), value };
  return value;
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

/** The port bin/START.* chose, so "Open the app" goes to the right place. */
function appPort() {
  const fromFile = readTextIfPresent(join(ROOT, ".seo-port"));
  const n = Number(fromFile ?? process.env.PORT ?? 3000);
  return Number.isFinite(n) && n > 0 ? n : 3000;
}

/** Ask the app itself, rather than trusting a pid file that may be stale. */
async function appIsResponding() {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1500);
    const res = await fetch(`http://localhost:${appPort()}/api/v1/health`, {
      signal: c.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
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
    running: await appIsResponding(),
    appPort: appPort(),
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
    if (await isDockerInstall())
      return refuseOnDocker("Install", "docker compose up -d");
    const ok = await runBin("START");
    // Only on success: a Desktop icon pointing at a half-built install
    // is worse than none.
    if (ok) await addDesktopShortcut();
    return ok;
  },
  start: async () =>
    (await isDockerInstall())
      ? refuseOnDocker("Start", "docker compose up -d")
      : runBin("START"),
  stop: async () =>
    (await isDockerInstall())
      ? refuseOnDocker("Stop", "docker compose down")
      : runBin("STOP"),
  shortcut: () => addDesktopShortcut(),

  update: async () => {
    if (await isDockerInstall())
      return refuseOnDocker("Update", "git pull && docker compose up -d --build");
    if (!(await which("git"))) {
      log("git isn't installed, so the code can't update itself.");
      log("Download the latest zip from GitHub and replace this folder,");
      log("keeping your data.db file — that's where everything lives.");
      return false;
    }
    return runStep("node", [join(ROOT, "bin", "seo-update.cjs")]);
  },

  doctor: () => runStep("node", [join(ROOT, "bin", "seo-doctor.cjs")]),

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
    if (await isDockerInstall()) {
      log("This install keeps its data in a Docker volume, which this");
      log("panel cannot reach from outside the container.");
      log("");
      log("Open the app and use Settings -> Backup. It takes the same");
      log("kind of snapshot, from inside, where the database actually is.");
      return false;
    }
    const dbPath = dbFilePath();
    if (!existsSync(dbPath)) {
      log("No data.db yet — there's nothing to back up.");
      return false;
    }

    // Same directory and naming as src/lib/auto-backup.ts, so the app's
    // retention pruning sees these too and there is one place to look.
    const dir = dataDirPath();
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+$/, "Z");
    const name = `${basename(dbPath)}.bak-${stamp}`;
    const dest = join(dir, name);

    let done = false;
    try {
      const require = createRequire(import.meta.url);
      const Database = require("better-sqlite3");
      const sqlite = new Database(dbPath, { readonly: true });
      try {
        // VACUUM INTO writes a fresh, fully-checkpointed copy and works
        // while the app is running, without blocking it.
        sqlite.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
        done = true;
        log("Took a consistent snapshot with SQLite (VACUUM INTO).");
      } finally {
        sqlite.close();
      }
    } catch (e) {
      log(`SQLite snapshot unavailable (${e.message.split("\n")[0]}).`);
    }

    if (!done) {
      // Last resort, and honest about what it is. The -wal file holds
      // committed data that data.db does not, so it has to come too or
      // the backup is quietly incomplete.
      if (await appIsResponding()) {
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
    }

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
    if (await isDockerInstall()) {
      log("Restoring into a Docker volume has to happen from inside the");
      log("container. Open the app and use Settings -> Backup.");
      return false;
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

    if (await appIsResponding()) {
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

// 127.0.0.1, not 0.0.0.0. This endpoint can run commands, so it must
// never be reachable from the network — the same decision bin/START.*
// makes for the app itself.
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  SEO Tool control panel: ${url}`);
  console.log("  Leave this window open — closing it closes the panel.\n");
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
  } catch {
    console.log(`  Open ${url} in your browser.`);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n  The control panel is already open at http://localhost:${PORT}\n` +
        "  Switch to that browser tab, or close the other window first.\n",
    );
  } else {
    console.error("\n  Couldn't start the control panel:", err.message, "\n");
  }
  process.exit(1);
});
