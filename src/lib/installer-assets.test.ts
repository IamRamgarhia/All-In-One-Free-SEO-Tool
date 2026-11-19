/**
 * Every file the Windows installer script references must exist.
 *
 * WHY THIS TEST EXISTS: the first real run of the installer workflow
 * failed at "Compile the installer" because seo-tool.iss pointed at
 * `..\public\favicon.ico`, which has never existed — the project's icon
 * is `public/icon.ico`, and `src/app/favicon.ico` is Next's route
 * convention rather than a public asset.
 *
 * ISCC aborts the whole compile on a missing SetupIconFile. So a
 * one-word filename error cost a full CI run on four runners, and it was
 * undetectable locally because Inno Setup is not installed on the
 * machine the script was written on.
 *
 * This check costs milliseconds and catches the same class of mistake
 * before a push: a Source: line, an icon, a licence file that is not
 * there. It does NOT prove the .iss compiles — only CI can do that —
 * but it removes the most boring reason for it not to.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const ISS = join(ROOT, "installer/seo-tool.iss");

/** Resolve a path as ISCC does: relative to the .iss file's folder. */
function fromIss(p: string): string {
  return resolve(join(ROOT, "installer"), p.replace(/\\/g, "/"));
}

describe("the installer script references files that exist", () => {
  const src = readFileSync(ISS, "utf8");

  /** Lines ISCC reads as a path, with the #define placeholders left out. */
  function referencedPaths(): { key: string; path: string }[] {
    const out: { key: string; path: string }[] = [];

    for (const key of ["SetupIconFile", "LicenseFile"]) {
      const m = src.match(new RegExp(`^${key}=(.+)$`, "m"));
      if (m) out.push({ key, path: m[1].trim() });
    }

    for (const m of src.matchAll(/^Source: "([^"]+)"/gm)) {
      const p = m[1];
      // Paths built from a #define are resolved by the workflow at
      // compile time from dist/, which does not exist until a build has
      // run. Those are covered by the workflow's own existence checks.
      if (p.includes("{#")) continue;
      out.push({ key: "Source", path: p });
    }

    return out;
  }

  it("finds paths to check, or this test proves nothing", () => {
    // A vacuous pass is the risk: if the parser stopped matching, every
    // assertion below would succeed against an empty list.
    expect(referencedPaths().length).toBeGreaterThanOrEqual(3);
  });

  it("every literal path exists on disk", () => {
    const missing = referencedPaths().filter((r) => !existsSync(fromIss(r.path)));
    expect(
      missing.map((m) => `${m.key}=${m.path}`),
      `These are referenced by installer/seo-tool.iss and are not there. ` +
        `ISCC aborts the compile on any of them, which costs a full CI run ` +
        `on four runners to discover:\n  ` +
        missing.map((m) => `${m.key}=${m.path}`).join("\n  "),
    ).toEqual([]);
  });

  it("the setup icon is a real ICO, not a PNG with the wrong extension", () => {
    // ISCC rejects a non-ICO too, with a different and less obvious
    // message. The header is four bytes: 00 00 01 00.
    const m = src.match(/^SetupIconFile=(.+)$/m);
    expect(m, "no SetupIconFile line").toBeTruthy();
    const buf = readFileSync(fromIss(m![1].trim()));
    expect(
      [buf[0], buf[1], buf[2], buf[3]],
      `${m![1].trim()} does not start with an ICO header`,
    ).toEqual([0, 0, 1, 0]);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("the host project and the workflow agree on the exe name", () => {
    // The .iss installs "SEO Tool.exe" and the workflow asserts dotnet
    // produced a file by that name. If AssemblyName changes and these do
    // not, the workflow fails at the check step with a confusing
    // "host exe was not produced".
    const csproj = readFileSync(
      join(ROOT, "installer/host/SeoToolHost.csproj"),
      "utf8",
    );
    const name = csproj.match(/<AssemblyName>(.+)<\/AssemblyName>/)?.[1];
    expect(name).toBeTruthy();
    expect(src).toContain(`${name}.exe`);
    const wf = readFileSync(
      join(ROOT, ".github/workflows/installer.yml"),
      "utf8",
    );
    expect(wf).toContain(`${name}.exe`);
  });

  it("the workflow passes every #define the script needs", () => {
    // A #define with no /D and no fallback makes ISCC fail on an
    // undefined identifier. Each one here has an #ifndef default, so
    // this asserts the workflow still passes the ones that matter.
    const wf = readFileSync(
      join(ROOT, ".github/workflows/installer.yml"),
      "utf8",
    );
    for (const d of ["AppVersion", "PayloadDir", "HostDir", "NodeDir"]) {
      expect(src, `${d} is not used by the script`).toContain(`{#${d}}`);
      expect(wf, `the workflow does not pass /D${d}`).toContain(`/D${d}=`);
    }
  });
});
