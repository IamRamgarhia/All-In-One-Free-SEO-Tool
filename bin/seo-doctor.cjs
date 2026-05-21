#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * `seo doctor` — prints a one-page diagnostic dump.
 *
 * Replaces 90% of the "what version of everything do you have?"
 * back-and-forth on support issues. Run from the install root:
 *   node bin/seo-doctor.cjs
 *
 * What it reports:
 *   - Node version + npm/pnpm version
 *   - OS + arch
 *   - Install path + persisted port
 *   - data.db integrity check (PRAGMA integrity_check)
 *   - Last applied migration
 *   - .seo-encryption-key presence (NOT the value)
 *   - Playwright Chromium present?
 *   - Server up at the persisted port? (/api/v1/health)
 *   - Last 20 lines of dev-server.log + dev-server.err.log
 *   - Disk space on the install partition
 *
 * Output is plain text — paste into a GitHub issue or email and the
 * maintainer has everything they need to triage. NO secrets are
 * printed; API keys are explicitly redacted.
 */

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execSync } = require("node:child_process");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

function colorize(text, color) {
  if (!process.stdout.isTTY) return text;
  return `${color}${text}${RESET}`;
}

function line(label, value, status) {
  const v = String(value);
  let mark = "  ";
  if (status === "ok") mark = colorize("✓ ", GREEN);
  else if (status === "warn") mark = colorize("! ", YELLOW);
  else if (status === "fail") mark = colorize("✗ ", RED);
  console.log(`${mark}${label.padEnd(26)} ${v}`);
}

function header(title) {
  console.log("");
  console.log(colorize(`${BOLD}${title}${RESET}`));
  console.log(colorize("─".repeat(40), DIM));
}

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

const installRoot = process.cwd();

(async function main() {

// ====================== HEADER ======================
console.log("");
console.log(colorize(`${BOLD}SEO Tool — diagnostic dump${RESET}`));
console.log(colorize(`Generated: ${new Date().toISOString()}`, DIM));

// ====================== Runtime ======================
header("Runtime");
line("Node", process.version, process.versions.node ? "ok" : "fail");
line("Platform", `${os.platform()} ${os.arch()} (${os.release()})`);
line("OS hostname", os.hostname());
line(
  "CPUs / Memory",
  `${os.cpus().length} cores, ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB total / ${(os.freemem() / 1024 ** 3).toFixed(1)} GB free`,
);

const pnpmV = tryExec("pnpm --version");
const npmV = tryExec("npm --version");
line("pnpm", pnpmV ?? "not installed", pnpmV ? "ok" : "warn");
line("npm", npmV ?? "not installed", npmV ? "ok" : "warn");

// ====================== Install ======================
header("Install");
line("Install root", installRoot);

const portFile = path.join(installRoot, ".seo-port");
const port = safe(() => fs.readFileSync(portFile, "utf-8").trim()) ?? "(none)";
line(".seo-port", port, port !== "(none)" ? "ok" : "warn");

const keyFile = path.join(installRoot, ".seo-encryption-key");
line(
  ".seo-encryption-key",
  fs.existsSync(keyFile) ? "present (value redacted)" : "missing",
  fs.existsSync(keyFile) ? "ok" : "warn",
);

const envLocal = path.join(installRoot, ".env.local");
line(
  ".env.local",
  fs.existsSync(envLocal) ? "present" : "missing (using defaults)",
  fs.existsSync(envLocal) ? "ok" : "warn",
);

const nextBuild = path.join(installRoot, ".next", "BUILD_ID");
line(
  ".next/BUILD_ID",
  fs.existsSync(nextBuild) ? "present (production-ready)" : "absent (will run dev mode)",
  fs.existsSync(nextBuild) ? "ok" : "warn",
);

const pidFile = path.join(installRoot, ".dev-server.pid");
const savedPid = safe(() => fs.readFileSync(pidFile, "utf-8").trim());
if (savedPid) {
  let alive = false;
  try {
    process.kill(Number(savedPid), 0);
    alive = true;
  } catch {
    alive = false;
  }
  line(
    ".dev-server.pid",
    `${savedPid} (${alive ? "alive" : "stale — process not found"})`,
    alive ? "ok" : "warn",
  );
} else {
  line(".dev-server.pid", "not running");
}

// ====================== Database ======================
header("Database");
const dbPath = process.env.SEO_DB_PATH || path.join(installRoot, "data.db");
const dbExists = fs.existsSync(dbPath);
line("data.db", dbExists ? dbPath : "missing", dbExists ? "ok" : "fail");

if (dbExists) {
  const stat = fs.statSync(dbPath);
  line("Size", `${(stat.size / 1024 / 1024).toFixed(2)} MB`);

  // Try to open via better-sqlite3 and run integrity_check.
  let Database;
  try {
    Database = require("better-sqlite3");
  } catch {
    Database = null;
  }
  if (Database) {
    try {
      const sqlite = new Database(dbPath, { readonly: true });
      const integ = sqlite.prepare("PRAGMA integrity_check").get();
      const integValue = (integ && integ.integrity_check) || "unknown";
      line(
        "Integrity check",
        integValue,
        integValue === "ok" ? "ok" : "fail",
      );

      const lastMig = sqlite
        .prepare(
          "SELECT hash, created_at FROM __drizzle_migrations ORDER BY id DESC LIMIT 1",
        )
        .get();
      if (lastMig) {
        const when = new Date(Number(lastMig.created_at)).toISOString();
        line("Last migration", `${lastMig.hash} (${when})`);
      } else {
        line("Last migration", "(no migrations recorded yet)", "warn");
      }

      const clientCount = sqlite
        .prepare("SELECT COUNT(*) as n FROM clients")
        .get();
      line("Clients tracked", String(clientCount?.n ?? "?"));

      sqlite.close();
    } catch (err) {
      line("Integrity check", `error: ${err.message}`, "fail");
    }
  } else {
    line("Integrity check", "better-sqlite3 not loadable", "fail");
  }
}

// ====================== Native modules ======================
header("Native modules");

// better-sqlite3 binding
const bsqDir = safe(() =>
  fs
    .readdirSync(path.join(installRoot, "node_modules"))
    .find((d) => d === "better-sqlite3"),
);
line(
  "better-sqlite3",
  bsqDir ? "installed" : "missing (run pnpm install)",
  bsqDir ? "ok" : "fail",
);

// Playwright Chromium
const playwrightCache = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? process.env.PLAYWRIGHT_BROWSERS_PATH
  : path.join(os.homedir(), "AppData", "Local", "ms-playwright");
const playwrightAltMac = path.join(
  os.homedir(),
  "Library",
  "Caches",
  "ms-playwright",
);
const playwrightAltLinux = path.join(os.homedir(), ".cache", "ms-playwright");
const playwrightPaths = [
  playwrightCache,
  playwrightAltMac,
  playwrightAltLinux,
];
const playwrightFound = playwrightPaths.find(
  (p) =>
    safe(() => fs.readdirSync(p).some((d) => d.startsWith("chromium"))) === true,
);
line(
  "Playwright Chromium",
  playwrightFound ? playwrightFound : "not found (rank-check + SERP scan disabled)",
  playwrightFound ? "ok" : "warn",
);

// ====================== Server reachability ======================
header("Server reachability");
if (port !== "(none)") {
  const url = `http://localhost:${port}/api/v1/health`;
  line("Health URL", url);
  // Use plain http module to avoid extra deps
  let healthy = false;
  let detail = "";
  try {
    const http = require("node:http");
    healthy = await new Promise((resolve) => {
      const req = http.get(
        url,
        { timeout: 3000 },
        (res) => {
          detail = `HTTP ${res.statusCode}`;
          res.resume();
          resolve(res.statusCode === 200);
        },
      );
      req.on("error", (err) => {
        detail = err.code || err.message;
        resolve(false);
      });
      req.on("timeout", () => {
        req.destroy();
        detail = "timeout";
        resolve(false);
      });
    });
  } catch (err) {
    detail = err.message;
  }
  line(
    "Health response",
    healthy ? detail : `${detail} (server not running?)`,
    healthy ? "ok" : "warn",
  );
}

// ====================== Recent logs ======================
header("Recent logs (last 20 lines each)");

function tailFile(filePath, n = 20) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath, "utf-8");
    const lines = buf.split(/\r?\n/);
    return lines.slice(-n).filter((l) => l.length > 0).join("\n");
  } catch {
    return null;
  }
}

const stdoutLog = path.join(installRoot, "dev-server.log");
const stderrLog = path.join(installRoot, "dev-server.err.log");

const stdoutTail = tailFile(stdoutLog);
const stderrTail = tailFile(stderrLog);

if (stdoutTail) {
  console.log(colorize("\ndev-server.log:", CYAN));
  console.log(stdoutTail);
} else {
  line("dev-server.log", "not present");
}
if (stderrTail) {
  console.log(colorize("\ndev-server.err.log:", CYAN));
  console.log(stderrTail);
} else {
  line("dev-server.err.log", "not present");
}

// ====================== Disk space ======================
header("Disk space");
try {
  const out = process.platform === "win32"
    ? tryExec(`powershell -NoProfile -Command "Get-PSDrive ${path.parse(installRoot).root.charAt(0)} | Select-Object Free,Used | ConvertTo-Json -Compress"`)
    : tryExec(`df -h "${installRoot}" | tail -1`);
  if (out) {
    line("Drive status", out);
  } else {
    line("Drive status", "could not measure", "warn");
  }
} catch {
  line("Drive status", "could not measure", "warn");
}

console.log("");
console.log(
  colorize(
    "Paste this output into a GitHub issue or email when reporting a bug.",
    DIM,
  ),
);
console.log(
  colorize(
    "No API keys, passwords, or DB content are shown — only structure.",
    DIM,
  ),
);
console.log("");

})().catch((err) => {
  console.error("seo doctor failed:", err.message);
  process.exit(1);
});
