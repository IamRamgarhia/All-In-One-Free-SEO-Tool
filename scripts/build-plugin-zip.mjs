/**
 * Build the WordPress plugin zip people actually install.
 *
 * Usage: node scripts/build-plugin-zip.mjs
 * Writes: wordpress-plugin/seo-tool-bridge.zip
 *
 * Why this exists rather than a zip someone made by hand once:
 *
 *   The committed zip was v0.6.0 while the source beside it was v0.6.1 —
 *   it had been built in September and never rebuilt, so anyone who
 *   downloaded it installed a plugin older than the one the app expects
 *   to talk to. `plugin-zip.test.ts` now fails if the two drift again,
 *   which is only enforceable because the zip is built by a script
 *   rather than produced by whoever last remembered.
 *
 * Two differences from the old zip, both of which a WordPress user
 * feels:
 *
 *   Everything sits under a `seo-tool-bridge/` folder. A zip with the
 *   PHP at its root makes WordPress name the plugin folder after the
 *   FILE — so the old wordpress-plugin.zip installed to a directory
 *   called "wordpress-plugin".
 *
 *   `tests/` is left out. It is 60 KB of PHPUnit-ish harness that does
 *   nothing on a live site and only widens what is executable there.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(ROOT, "wordpress-plugin");
const OUT = join(SRC, "seo-tool-bridge.zip");

/** Shipped to a live site. Anything not named here stays out. */
const SHIP = ["seo-tool-bridge.php", "readme.txt"];

const version = (() => {
  const php = readFileSync(join(SRC, "seo-tool-bridge.php"), "utf8");
  const m = /^\s*\*?\s*Version:\s*([0-9.]+)/m.exec(php);
  if (!m) throw new Error("No `Version:` header in seo-tool-bridge.php");
  return m[1];
})();

const stage = mkdtempSync(join(tmpdir(), "seo-plugin-"));
try {
  const folder = join(stage, "seo-tool-bridge");
  mkdirSync(folder, { recursive: true });
  for (const f of SHIP) cpSync(join(SRC, f), join(folder, f));

  rmSync(OUT, { force: true });

  /**
   * Both of these write zip entries with forward slashes, which the
   * format requires and WordPress needs to see a folder.
   *
   * PowerShell's Compress-Archive does NOT: it writes
   * `seo-tool-bridge\readme.txt` as a literal entry name. The first
   * version of this script used it, and the archive it produced could
   * not even be read back by `unzip -p 'seo-tool-bridge/...'` — a
   * WordPress install would have ended up with one oddly-named file
   * instead of a plugin. bsdtar ships with Windows 10+ and handles it
   * correctly, so there is no reason to reach for Compress-Archive.
   */
  const ZIPPERS = [
    { cmd: "zip", args: ["-qr", OUT, "seo-tool-bridge"] },
    { cmd: "C:/Windows/System32/tar.exe", args: ["-a", "-c", "-f", OUT, "seo-tool-bridge"] },
    { cmd: "tar", args: ["-a", "-c", "-f", OUT, "seo-tool-bridge"] },
  ];

  let zipped = false;
  const tried = [];
  for (const z of ZIPPERS) {
    try {
      execFileSync(z.cmd, z.args, { cwd: stage, stdio: "pipe" });
      if (statSync(OUT).size > 0) {
        zipped = true;
        break;
      }
    } catch (e) {
      tried.push(`${z.cmd}: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
    }
  }
  if (!zipped) {
    throw new Error(
      `Could not create the zip. Tried:\n  ${tried.join("\n  ")}\n` +
        `Install \`zip\`, or run this on Windows 10+ where bsdtar is built in.`,
    );
  }

  // Refuse to ship an archive WordPress cannot unpack. Cheap to check,
  // and the failure it catches is silent everywhere else.
  const names = execFileSync("C:/Windows/System32/tar.exe", ["-tf", OUT], {
    encoding: "utf8",
  }).trim();
  if (names.includes("\\")) {
    rmSync(OUT, { force: true });
    throw new Error(
      `The zip was written with backslash entry names:\n${names}\n` +
        `WordPress would create a file rather than a plugin folder.`,
    );
  }

  const kb = (statSync(OUT).size / 1024).toFixed(0);
  console.log(`Wrote wordpress-plugin/seo-tool-bridge.zip (v${version}, ${kb} KB)`);
  console.log(`Contains: seo-tool-bridge/{${SHIP.join(", ")}}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
