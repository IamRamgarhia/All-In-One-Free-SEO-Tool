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
    : `dist/seo-tool-v${version}.zip`,
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
function exportTrackedFiles(into) {
  mkdirSync(into, { recursive: true });
  // Relative filename, with cwd set to the destination. GNU tar on
  // Windows reads "C:\..." as a remote host spec and tries to resolve
  // "C" as a hostname, so an absolute path here fails with the
  // wonderfully unhelpful "Cannot connect to C: resolve failed".
  const tarball = join(into, "tracked.tar");
  execFileSync("git", ["archive", "--format=tar", "-o", tarball, "HEAD"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  execFileSync("tar", ["-xf", "tracked.tar"], { cwd: into, stdio: "pipe" });
  rmSync(tarball, { force: true });
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
    // PowerShell's Compress-Archive is on every supported Windows and
    // needs nothing installed. `zip` is used where it exists because it
    // preserves the executable bit, which the .command and .sh need.
    let zipped = false;
    try {
      execFileSync("zip", ["-qr", OUT, "."], { cwd: payload, stdio: "pipe" });
      zipped = true;
    } catch {
      /* fall through */
    }
    if (!zipped) {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Compress-Archive -Path '${payload}\\*' -DestinationPath '${OUT}' -Force`,
        ],
        { stdio: "pipe" },
      );
      say("Used Compress-Archive — the Mac/Linux launchers will need chmod +x.");
    }

    const mb = (statSync(OUT).size / 1024 / 1024).toFixed(1);
    say(`Wrote ${OUT} (${mb} MB)`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

main();
