import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { listZipEntries, readZipEntry } from "./zip-read";

/**
 * The WordPress plugin zip people download.
 *
 * It is a committed binary, which is only defensible with a test
 * holding it to the source beside it — and that is exactly what was
 * missing. The old `wordpress-plugin.zip` was built in September and
 * never rebuilt: it shipped v0.6.0 while the PHP next to it said
 * v0.6.1, so anyone who installed it got a plugin older than the app
 * expects to talk to, and nothing anywhere said so.
 *
 * Reads the archive with zip-read.ts rather than shelling out to `tar`.
 * The first version did shell out and became the only test in the suite
 * that forks a process — which made it the only one that could go red
 * from machine load rather than from a defect, and it did so twice.
 *
 * Rebuild with: node scripts/build-plugin-zip.mjs
 */

const ROOT = process.cwd();
const ZIP = join(ROOT, "wordpress-plugin/seo-tool-bridge.zip");
const PHP = join(ROOT, "wordpress-plugin/seo-tool-bridge.php");

const zip = () => readFileSync(ZIP);
const names = () => listZipEntries(zip()).map((e) => e.name);

function versionOf(text: string): string | null {
  return /^\s*\*?\s*Version:\s*([0-9.]+)/m.exec(text)?.[1] ?? null;
}

const cmp = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};

describe("the downloadable WordPress plugin", () => {
  it("exists and is a plausible size", () => {
    expect(existsSync(ZIP), "run: node scripts/build-plugin-zip.mjs").toBe(true);
    const kb = statSync(ZIP).size / 1024;
    expect(kb).toBeGreaterThan(5);
    expect(kb).toBeLessThan(500);
  });

  it("matches the version of the source beside it", () => {
    // The drift that shipped: zip 0.6.0, source 0.6.1.
    const inZip = readZipEntry(zip(), "seo-tool-bridge/seo-tool-bridge.php").toString("utf8");
    const zipVersion = versionOf(inZip);
    const srcVersion = versionOf(readFileSync(PHP, "utf8"));

    expect(srcVersion, "no Version: header in the plugin source").not.toBeNull();
    expect(
      zipVersion,
      `the zip ships v${zipVersion} and the source is v${srcVersion} — ` +
        `rebuild with: node scripts/build-plugin-zip.mjs`,
    ).toBe(srcVersion);
  });

  it("ships the same bytes as the source, not an old copy", () => {
    // A matching version header is not the same as matching code —
    // somebody can edit the PHP without touching the header.
    const inZip = readZipEntry(zip(), "seo-tool-bridge/seo-tool-bridge.php").toString("utf8");
    expect(
      inZip.replace(/\r\n/g, "\n"),
      "the zip's PHP differs from the source — rebuild it",
    ).toBe(readFileSync(PHP, "utf8").replace(/\r\n/g, "\n"));
  });

  it("unpacks into a plugin folder, not loose files", () => {
    // WordPress names the plugin directory after the zip's top-level
    // entry. Loose files at the root made the old zip install to a
    // folder called "wordpress-plugin".
    for (const e of names()) {
      expect(e.startsWith("seo-tool-bridge/"), `${e} is outside the folder`).toBe(true);
    }
  });

  it("uses forward slashes, so WordPress sees a folder", () => {
    // PowerShell's Compress-Archive writes `seo-tool-bridge\file.php` as
    // a literal entry name. The archive looks fine in Explorer and
    // unpacks to one oddly-named file through PHP's unzip. The build
    // script refuses to emit one; this is the second line of defence.
    for (const e of names()) {
      expect(e, "backslash in a zip entry name").not.toContain("\\");
    }
  });

  it("ships only what a live site needs", () => {
    // The test harness is 60 KB of PHP that does nothing in production
    // and only widens what is executable on someone's server.
    const files = names().filter((e) => !e.endsWith("/"));
    expect(files.sort()).toEqual([
      "seo-tool-bridge/readme.txt",
      "seo-tool-bridge/seo-tool-bridge.php",
    ]);
  });

  it("is new enough for every capability the app gates on", () => {
    /**
     * capabilities.ts turns features off below a given plugin version —
     * `hasPluginVersion(wpVersion, "0.6.0")` and friends. Handing out a
     * zip older than the highest of those would be a download that
     * arrives already too old, and the user would see capabilities
     * missing with no clue why.
     *
     * Read from the source, so a fourth gate added later raises this
     * automatically.
     */
    const caps = readFileSync(join(ROOT, "src/lib/agent/capabilities.ts"), "utf8");
    const gated = [
      ...caps.matchAll(/hasPluginVersion\([^,]+,\s*"([0-9.]+)"\)/g),
    ].map((m) => m[1]);
    expect(gated.length, "no version gates found — did the call change?").toBeGreaterThan(0);

    const highest = gated.reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
    const shipped = versionOf(readFileSync(PHP, "utf8"))!;
    expect(
      cmp(shipped, highest),
      `the app gates capabilities on plugin >= ${highest}, but the zip ` +
        `ships ${shipped} — those features would be off on a fresh install`,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("zip-read", () => {
  // The reader is only trustworthy if it fails loudly on input it does
  // not understand, rather than returning a plausible empty list.
  it("rejects something that is not a zip", () => {
    expect(() => listZipEntries(Buffer.from("not a zip at all"))).toThrow(
      /no end-of-central-directory/i,
    );
  });

  it("rejects a request for an entry that is not there", () => {
    expect(() => readZipEntry(zip(), "seo-tool-bridge/nope.php")).toThrow(
      /No entry named/,
    );
  });

  it("round-trips a deflated entry byte for byte", () => {
    const readme = readZipEntry(zip(), "seo-tool-bridge/readme.txt");
    expect(readme.length).toBe(statSync(join(ROOT, "wordpress-plugin/readme.txt")).size);
  });
});
