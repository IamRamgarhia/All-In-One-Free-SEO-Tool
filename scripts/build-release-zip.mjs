/**
 * Build the release ZIP: one launcher per computer, nothing else on top.
 *
 * WHY NOT JUST `git archive`
 *
 * That is what the v0.6.0 download was, and it hands someone a folder
 * with `SEO Tool.cmd`, `SEO Tool.command`, `install.ps1`, `install.sh`,
 * `docker-compose.yml`, `Dockerfile`, `package.json` and twenty more
 * entries, and no indication which of them to click. The answer to "how
 * do I start this" should be visible without reading anything.
 *
 * So the shipped layout is not the repo layout:
 *
 *   SEO Tool - WINDOWS.hta     <- double-click this
 *   SEO Tool - MAC.command     <- or this
 *   SEO Tool - LINUX.sh        <- or this
 *   READ ME FIRST.txt
 *   _system/                   <- the entire project, out of the way
 *       _system-scripts/       <- what the launchers run
 *       bin/  src/  scripts/  package.json ...
 *
 * The launchers are the only things at the top. Everything that would
 * make someone hesitate is one folder down, named so it reads as
 * plumbing rather than a choice.
 *
 * Usage:  node scripts/build-release-zip.mjs [--out dist/seo-tool.zip]
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseAssetName } from "./update-plan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const version = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
).version;

const outArg = process.argv.indexOf("--out");
const OUT = resolve(
  ROOT,
  outArg !== -1 && process.argv[outArg + 1]
    ? process.argv[outArg + 1]
    : `dist/${releaseAssetName(version)}`,
);

function say(msg) {
  process.stdout.write(`  ${msg}\n`);
}

/**
 * The project, exactly as git has it — no node_modules, no .next, no
 * data.db, no .env, no backups. Using git rather than a copy-with-
 * exclusions means the contents are whatever is committed, which is
 * checkable, rather than whatever my ignore list happened to remember.
 */
/**
 * What a person needs to install and run this, and nothing else.
 *
 * An allowlist of top-level entries rather than a list of things to
 * exclude, so a new dev folder added next year is left out by default
 * instead of quietly shipping. Anything genuinely needed gets added
 * here deliberately, and the install test below is what proves the list
 * is not too small.
 */
const SHIP_TOP_LEVEL = new Set([
  // Build and run
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "components.json",
  "drizzle.config.ts",
  ".env.example",
  "src",
  "public",
  "bin",
  "scripts",
  // Documented install path, and the app's own docs link to these
  "Dockerfile",
  "docker-compose.yml",
  "docs",
  "README.md",
  "LICENSE",
  // Things the app tells people to use. The client screen literally
  // says "wordpress-plugin/seo-tool-bridge.php", so shipping the app
  // without it points at a file that is not there.
  "wordpress-plugin",
  "extension",
  "plugins",
]);

/**
 * Paths inside those entries that are for developing this, not running
 * it. Each one is here for a measured reason, noted where it is not
 * obvious.
 */
const DROP = [
  // 91 files. Nothing imports them at runtime.
  /(^|\/)[^/]+\.test\.(ts|tsx)$/,
  // 4.2 MB of drizzle-kit snapshots. scripts/migrate.cjs reads only the
  // .sql files — checked, it filters on endsWith(".sql") — so these are
  // needed to *generate* a migration and never to *apply* one.
  /^src\/db\/migrations\/meta\//,
  // 1 MB of README images. GitHub serves them from the repo; a local
  // copy of the README is not why anyone downloaded this.
  /^docs\/screenshots\//,
  // Notes to ourselves, not to the person installing.
  /^docs\/audits\//,
  /^docs\/competitive-review/,
  /^docs\/mcp-connections-plan/,
  // The PHP suite for the WordPress plugin.
  /^wordpress-plugin\/tests\//,
  // Dev-only scripts. Kept: migrate, migrate-watch, control-panel,
  // mcp-server (the MCP server is a shipped feature people point Claude
  // at), package.ts.
  /^scripts\/(audit-fixtures|mcp-check|mcp-http-check|wp-bridge-check|gen-social-preview|gen-tool-capabilities|report-batch-check|first-run-check|route-sweep|build-release-zip|migrate-watch)\./,
  // Superseded by the launchers at the top of this zip.
  /^install\.(ps1|sh)$/,
];

/**
 * Exported so a test can ask the real question — "would this file be in
 * the download?" — instead of parsing the regexes above out of this
 * file's own source.
 *
 * The first version of that test did parse them, and the extraction
 * silently matched nothing: it reported zero patterns, asserted against
 * an empty list, and passed while the file in front of it excluded the
 * zip updater. A guard that cannot fail is worse than no guard, because
 * it is also a claim.
 */
export function shouldShip(path) {
  const top = path.split("/")[0];
  if (!SHIP_TOP_LEVEL.has(top)) return false;
  return !DROP.some((rx) => rx.test(path));
}

function exportTrackedFiles(into) {
  mkdirSync(into, { recursive: true });
  // git, so only committed files can ship — never a stray data.db, .env
  // or half-finished file sitting in the working tree.
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);

  let shipped = 0;
  for (const rel of tracked) {
    if (!shouldShip(rel)) continue;
    const from = join(ROOT, rel);
    if (!existsSync(from)) continue;
    const to = join(into, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    shipped++;
  }
  say(`Shipping ${shipped} of ${tracked.length} tracked files`);
  return { shipped, tracked: tracked.length };
}

function main() {
  const stage = mkdtempSync(join(tmpdir(), "seo-release-"));
  const payload = join(stage, "payload");
  const system = join(payload, "_system");

  try {
    say(`Building v${version}`);

    say("Exporting tracked files...");
    exportTrackedFiles(system);

    // release-templates/ is build input, not something to ship inside
    // _system — the launchers it holds belong at the top.
    const templatesInSystem = join(system, "release-templates");
    if (existsSync(templatesInSystem)) rmSync(templatesInSystem, { recursive: true, force: true });

    say("Placing the launchers...");
    const templates = join(ROOT, "release-templates");
    for (const name of [
      "SEO Tool - WINDOWS.hta",
      "SEO Tool - MAC.command",
      "SEO Tool - LINUX.sh",
      "READ ME FIRST.txt",
    ]) {
      const from = join(templates, name);
      if (!existsSync(from)) throw new Error(`missing release template: ${name}`);
      cpSync(from, join(payload, name));
    }

    // The scripts the launchers call live with the project, not beside
    // the launchers: one folder at the top is the whole point.
    cpSync(join(templates, "_system-scripts"), join(system, "_system-scripts"), {
      recursive: true,
    });

    mkdirSync(dirname(OUT), { recursive: true });
    rmSync(OUT, { force: true });

    say("Zipping...");
    /**
     * `zip` first because it preserves the executable bit the .command
     * and .sh launchers need. bsdtar second — it ships with Windows 10+
     * and writes conformant archives.
     *
     * NOT PowerShell's Compress-Archive, which was the fallback here and
     * writes entry names with BACKSLASHES: `_system\Dockerfile` as a
     * single literal name rather than a path. Windows Explorer hides
     * this by being forgiving, so the zip looks right on the machine
     * that built it — and the published v0.9.0 shipped with 1,367 such
     * entries. On macOS and Linux that unpacks to a heap of
     * backslash-named files with no directories at all, so the
     * double-click-a-launcher install the README recommends cannot
     * work. Checked, not assumed: the assertion below now fails the
     * build rather than letting another one out.
     */
    let zipped = false;
    const attempts = [];
    for (const z of [
      { cmd: "zip", args: ["-qr", OUT, "."] },
      { cmd: "C:/Windows/System32/tar.exe", args: ["-a", "-c", "-f", OUT, "."] },
      { cmd: "tar", args: ["-a", "-c", "-f", OUT, "."] },
    ]) {
      try {
        execFileSync(z.cmd, z.args, { cwd: payload, stdio: "pipe" });
        if (statSync(OUT).size > 0) {
          zipped = true;
          if (z.cmd !== "zip") {
            say(`Used ${z.cmd} — the Mac/Linux launchers will need chmod +x.`);
          }
          break;
        }
      } catch (e) {
        attempts.push(`${z.cmd}: ${String(e?.message ?? e).split("\n")[0]}`);
      }
    }
    if (!zipped) {
      throw new Error(
        `Could not create the zip. Tried:\n  ${attempts.join("\n  ")}\n` +
          `Install \`zip\`, or build on Windows 10+ where bsdtar is present.`,
      );
    }

    // Refuse to publish an archive that does not unpack into folders.
    const listed = execFileSync(
      existsSync("C:/Windows/System32/tar.exe") ? "C:/Windows/System32/tar.exe" : "tar",
      ["-tf", OUT],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const bad = listed.split(/\r?\n/).filter((n) => n.includes("\\"));
    if (bad.length > 0) {
      rmSync(OUT, { force: true });
      throw new Error(
        `${bad.length} zip entries use backslashes, e.g. ${bad[0]}\n` +
          `That archive does not unpack into folders on macOS or Linux.`,
      );
    }

    const mb = (statSync(OUT).size / 1024 / 1024).toFixed(1);
    say(`Wrote ${OUT} (${mb} MB)`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

// Only when run as a command. Importing this file — which the test
// does, to call shouldShip against the real lists — must not build a
// release zip as a side effect.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
