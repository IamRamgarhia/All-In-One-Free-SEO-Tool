import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The packaging script, checked at the source level.
 *
 * It used PowerShell's Compress-Archive as its fallback, which writes
 * zip entry names with BACKSLASHES — `_system\Dockerfile` as one
 * literal name rather than a path. Windows Explorer is forgiving enough
 * to hide it, so the archive looks correct on the machine that built
 * it, and the published v0.9.0 shipped with 1,367 such entries. On
 * macOS and Linux that unpacks to a heap of backslash-named files with
 * no directories, so "download it and double-click a launcher" — the
 * install the README leads with — cannot work.
 *
 * There is no artefact to inspect here: dist/ is gitignored and only
 * exists on a machine that has run the packaging script. So this
 * asserts the two properties of the script that stop it happening
 * again, and the script itself refuses to emit an archive containing a
 * backslash — which is the check that actually runs at release time.
 */

const SCRIPT = readFileSync(
  join(process.cwd(), "scripts/build-release-zip.mjs"),
  "utf8",
);

describe("the release packaging script", () => {
  it("does not CALL Compress-Archive", () => {
    // The name still appears in the comment explaining why it is not
    // used, and that comment is worth keeping — so this looks for the
    // invocation, not the word. The first version of this test did the
    // latter and failed against correct code.
    const code = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(
      code,
      "Compress-Archive writes backslash entry names — use zip or bsdtar",
    ).not.toMatch(/Compress-Archive\s+-Path/);
  });

  it("verifies its own output before letting it out", () => {
    // Belt and braces: even if someone adds another zip backend, the
    // archive is listed back and rejected if any entry has a backslash.
    const code = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code, "no listing-back of the archive").toMatch(/-tf/);
    expect(code, "nothing filters entries for a backslash").toMatch(
      /includes\(\s*["'`]\\\\["'`]\s*\)/,
    );
    expect(code, "a bad archive is not deleted").toMatch(/rmSync\(OUT/);
  });

  it("still prefers zip, which keeps the executable bit", () => {
    // The .command and .sh launchers need it; bsdtar is the fallback
    // for machines without `zip`, not the preference.
    const zipAt = SCRIPT.indexOf('cmd: "zip"');
    const tarAt = SCRIPT.indexOf("tar.exe");
    expect(zipAt).toBeGreaterThan(-1);
    expect(tarAt).toBeGreaterThan(zipAt);
  });

  it("fails loudly when nothing can make a zip", () => {
    // Silently producing no archive, or a zero-byte one, would publish
    // a release asset nobody can open.
    expect(SCRIPT).toMatch(/Could not create the zip/);
    expect(SCRIPT).toMatch(/statSync\(OUT\)\.size > 0/);
  });
});

describe("the zip updater ships inside the zip", () => {
  /**
   * The release zip is the install that CANNOT update any other way.
   * A git checkout can pull; a download can only replace itself with
   * `bin/seo-update-zip.mjs`, and that script imports two others. Drop
   * any one of them from the package and the Update button fails on
   * exactly the installs it was written for — and only for them, so
   * nothing here would notice.
   *
   * The allowlist is by TOP-LEVEL entry, so what actually needs
   * checking is that no DROP pattern catches these paths.
   */
  const NEEDED = [
    "bin/seo-update-zip.mjs",
    "scripts/zip-read.mjs",
    "scripts/update-plan.mjs",
    // Not the updater's, but the same shape of problem: the control
    // panel cannot resolve a backup location or an install mode
    // without them.
    "scripts/backup-dir.mjs",
    "scripts/install-mode.mjs",
    "scripts/app-port.mjs",
  ];

  it("includes every file the updater needs", async () => {
    // Calls the packaging script's OWN decision, rather than parsing
    // its regexes out of its source. The first version did the latter,
    // and the extraction quietly matched nothing — it checked an empty
    // list of patterns and passed against a file that really did
    // exclude the updater.
    const { shouldShip } = await import("../../scripts/build-release-zip.mjs");
    for (const path of NEEDED) {
      expect(
        shouldShip(path),
        `${path} would NOT be in the download, so a downloaded install cannot update itself`,
      ).toBe(true);
    }
  });

  it("still excludes what it is supposed to", async () => {
    // Guards the assertion above: if shouldShip ever returned true for
    // everything, the check would pass while meaning nothing.
    const { shouldShip } = await import("../../scripts/build-release-zip.mjs");
    expect(shouldShip("src/lib/audit.test.ts")).toBe(false);
    expect(shouldShip("install.ps1")).toBe(false);
    expect(shouldShip("docs/screenshots/a.png")).toBe(false);
    expect(shouldShip(".github/workflows/ci.yml")).toBe(false);
  });
});

describe("the plugin packaging script", () => {
  const PLUGIN = readFileSync(
    join(process.cwd(), "scripts/build-plugin-zip.mjs"),
    "utf8",
  );

  it("has the same protection", () => {
    // Same bug, same shape, and it was found here first.
    expect(PLUGIN).not.toMatch(/Compress-Archive\s*-Path/);
    expect(PLUGIN).toMatch(/backslash/i);
  });
});
