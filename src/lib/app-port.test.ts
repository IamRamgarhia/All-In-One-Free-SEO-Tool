import { describe, expect, it } from "vitest";
import {
  candidatePorts,
  healthMatches,
  samePath,
} from "../../scripts/app-port.mjs";

/**
 * The control panel's "Running" light and its "Open the app" button.
 *
 * This is here because of a measured wrong answer, not a hypothetical.
 * On 30 Oct 2026 `.seo-port` on the maintainer's machine said 3399 while
 * a healthy app answered on 3000 — the file records where bin/START.*
 * last put the app, and that run had been started another way. The panel
 * trusted the file, showed "Installed, not running" over a running app,
 * and pointed Open at a dead port. Nothing threw.
 */

describe("candidatePorts", () => {
  it("tries the remembered port first", () => {
    expect(candidatePorts("3399", undefined)).toEqual([3399, 3000]);
  });

  it("falls through to 3000 when nothing is remembered", () => {
    // The case that was broken: .seo-port is stale, so the real port has
    // to be reachable from somewhere other than that file.
    expect(candidatePorts(null, undefined)).toEqual([3000]);
  });

  it("never repeats a port", () => {
    // Probing 3000 three times is three timeouts on a stopped app, and
    // the panel polls this every few seconds.
    expect(candidatePorts("3000", "3000")).toEqual([3000]);
  });

  it("honours PORT between the file and the default", () => {
    expect(candidatePorts("3399", "8080")).toEqual([3399, 8080, 3000]);
  });

  it("drops values that are not ports", () => {
    // A truncated or half-written .seo-port must not become port 0 or
    // NaN and make every probe fail in a way that reads as "stopped".
    for (const junk of ["", "  ", "abc", "0", "-1", "99999", "3000x"]) {
      expect(candidatePorts(junk, undefined), `junk=${JSON.stringify(junk)}`).toEqual([
        3000,
      ]);
    }
  });

  it("keeps a port that merely looks odd but is legal", () => {
    expect(candidatePorts("65535", undefined)).toEqual([65535, 3000]);
  });
});

describe("samePath", () => {
  it("ignores case and separator style on Windows", () => {
    expect(samePath("C:\\Users\\a\\seo", "c:/users/a/seo", true)).toBe(true);
    expect(samePath("C:\\Users\\a\\seo\\", "C:\\Users\\a\\seo", true)).toBe(true);
  });

  it("is exact elsewhere, where case is meaningful", () => {
    expect(samePath("/home/a/seo", "/home/a/SEO", false)).toBe(false);
    expect(samePath("/home/a/seo/", "/home/a/seo", false)).toBe(true);
  });

  it("treats a different folder as different", () => {
    expect(samePath("C:\\Users\\a\\seo", "C:\\Users\\a\\seo2", true)).toBe(false);
  });

  it("never matches an empty path against anything", () => {
    // Otherwise a health body with no installRoot would "match" a
    // missing root, and the panel would adopt a stranger's server.
    expect(samePath("", "", true)).toBe(false);
    expect(samePath("", "C:\\x", true)).toBe(false);
    expect(samePath(null, undefined, false)).toBe(false);
  });
});

describe("healthMatches", () => {
  const ROOT = "C:\\Users\\a\\seo";
  const ours = { ok: true, service: "seo-tool", installRoot: ROOT };

  it("accepts this install's own app", () => {
    expect(healthMatches(ours, ROOT, true)).toBe(true);
  });

  it("rejects the same app from a different folder", () => {
    // Two checkouts, one of them running. Aiming Stop at the wrong one
    // is the damage this prevents.
    expect(
      healthMatches({ ...ours, installRoot: "C:\\Users\\a\\seo-clone" }, ROOT, true),
    ).toBe(false);
  });

  it("rejects a different service on the same port", () => {
    // 3000 is the most contended port in local development.
    expect(healthMatches({ ok: true, service: "other-app" }, ROOT, true)).toBe(false);
  });

  it("accepts an older build that predates installRoot", () => {
    // Absent is not a mismatch. Treating it as one would report a
    // running app as stopped, which is the bug this file is about.
    expect(healthMatches({ ok: true, service: "seo-tool" }, ROOT, true)).toBe(true);
    expect(healthMatches({ ok: true }, ROOT, true)).toBe(true);
  });

  it("rejects anything that is not an object", () => {
    // The array is the one worth listing: it is an object to typeof and
    // carries neither field, so without an explicit check it reaches the
    // permissive "older build" branch and passes.
    for (const body of [null, undefined, "ok", 1, [], [{ service: "seo-tool" }]]) {
      expect(healthMatches(body as never, ROOT, true), JSON.stringify(body)).toBe(false);
    }
  });
});
