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

    for (const key of [
      "SetupIconFile",
      "LicenseFile",
      "WizardImageFile",
      "WizardSmallImageFile",
    ]) {
      const m = src.match(new RegExp(`^${key}=(.+)$`, "m"));
      if (!m) continue;
      const p = m[1].trim();
      // installer/art/ is GENERATED from public/icon-512.png by
      // scripts/build-installer-art.mjs, so it is absent in a fresh
      // clone and present in CI. Checking it for existence here would
      // fail on every clean checkout. The test below asserts the
      // generator and the CI step instead, which is the thing that
      // would actually break.
      if (/(^|[\\/])art[\\/]/.test(p)) continue;
      out.push({ key, path: p });
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

  it("ships the whole host output, not just the exe", () => {
    // MEASURED on the first machine the installer was ever run on: the
    // [Files] line was `{#HostDir}\SEO Tool.exe`, so exactly one file
    // was installed. PublishSingleFile bundles the MANAGED assemblies
    // and the .NET runtime into the exe but NOT native ones, so
    // WebView2Loader.dll sat beside it in the publish output and was
    // left behind.
    //
    // The app then opened, P/Invoked into the missing DLL, caught
    // DllNotFoundException, and reported "the Microsoft Edge WebView2
    // runtime is missing on this computer" — on a computer with
    // WebView2 158.0.4370.26 installed. A packaging bug of ours,
    // presented as a fault in the user's machine, with a suggested fix
    // that could not possibly work.
    expect(
      src,
      "the host is installed file-by-file again; a native sibling will be dropped",
    ).not.toMatch(/Source:\s*"\{#HostDir\}\\[^*"]+"/);
    expect(src).toMatch(/Source:\s*"\{#HostDir\}\\\*"/);
    // recursesubdirs, because a publish can emit runtimes\ subfolders.
    const hostLine = src.match(/^Source:\s*"\{#HostDir\}\\\*".*$/m)?.[0] ?? "";
    expect(hostLine).toContain("recursesubdirs");
  });

  it("the workflow checks the native loader was produced", () => {
    // The .iss copying a whole folder does not help if the folder never
    // had the DLL in it — a csproj change can stop it being emitted.
    const wf = readFileSync(
      join(ROOT, ".github/workflows/installer.yml"),
      "utf8",
    );
    expect(wf).toMatch(/WebView2Loader\.dll/);
    expect(wf, "a missing loader must fail the build, not warn").toMatch(
      /WebView2Loader[\s\S]{0,700}exit 1/,
    );
  });

  it("CI runs the host, not just checks it exists", () => {
    // The bug this is for: the only check was `test -f "SEO Tool.exe"`.
    // The exe existed perfectly and could not open a window. An
    // existence check cannot catch that — and the thing that did was a
    // person double-clicking it and being blamed for it.
    //
    // scripts/build-payload.mjs has always done this properly: it does
    // not check better-sqlite3 is present, it opens a database and
    // reads a row back.
    const wf = readFileSync(
      join(ROOT, ".github/workflows/installer.yml"),
      "utf8",
    );
    const host = readFileSync(
      join(ROOT, "installer/host/SeoToolHost.cs"),
      "utf8",
    );
    expect(host, "the host has no --self-test mode").toContain("--self-test");
    expect(wf, "CI never runs the published host").toContain("--self-test");

    // The exit codes must stay distinguished, or a runner without the
    // Edge runtime fails builds for a fault that is not ours — and the
    // temptation then is to stop failing on either, which puts the
    // original bug straight back.
    expect(host).toContain("ExitOwnInstallBroken");
    expect(host).toContain("ExitNoWebView2Runtime");
    expect(wf, "exit code 2 must fail the build").toMatch(/\b2\)[\s\S]{0,400}exit 1/);
    expect(wf, "exit code 3 must NOT fail the build").toMatch(
      /\b3\)[\s\S]{0,400}::warning::/,
    );
  });

  it("the self-test log is not shipped to users", () => {
    // It is written next to the exe, which is the folder the installer
    // then packages wholesale now.
    const wf = readFileSync(
      join(ROOT, ".github/workflows/installer.yml"),
      "utf8",
    );
    expect(wf).toMatch(/rm -f "dist\/installer-host\/selftest\.log"/);
  });

  it("the host migrates before it starts the server", () => {
    // MEASURED on a throwaway data directory, which is what a first
    // install is: the server booted, /api/v1/health answered 200, and
    // the first real page returned 500. Nothing had ever created the
    // schema, because this host ran `node server.js` while the Docker
    // entrypoint has always run `migrate.cjs && server.js`.
    //
    // Health answering 200 is what hid it — that endpoint does not
    // touch the database, so the readiness check passed over an app
    // that could not serve a page.
    const host = readFileSync(
      join(ROOT, "installer/host/SeoToolHost.cs"),
      "utf8",
    );
    expect(host).toContain("migrate.cjs");
    const migrateAt = host.indexOf("await RunMigrationsAsync()");
    const startAt = host.indexOf("StartServer(_port)");
    expect(migrateAt, "the host never runs migrations").toBeGreaterThan(-1);
    expect(
      migrateAt,
      "the server is started before the schema exists",
    ).toBeLessThan(startAt);
  });

  it("sets SEO_DB_PATH, not just SEO_DATA_DIR", () => {
    // These resolve DIFFERENTLY and that is the whole point:
    //
    //   src/db/client.ts     SEO_DB_PATH ?? cwd()/data.db   (no SEO_DATA_DIR)
    //   scripts/migrate.cjs  SEO_DB_PATH || cwd()/data.db   (no SEO_DATA_DIR)
    //   src/lib/data-dir.ts  SEO_DATA_DIR first
    //
    // So setting only SEO_DATA_DIR split the install in two: backups
    // and the session secret went to %LOCALAPPDATA%\SEO Tool while the
    // DATABASE was created in the working directory, inside the
    // installed program folder. Measured: {app}\app\data.db at 667 KB,
    // and a 663 KB backup of it sitting in the data directory next to
    // no database at all.
    //
    // That makes seo-tool.iss's promise untrue — "NOT the database. It
    // lives in %LOCALAPPDATA%\SEO Tool" — and leaves the one
    // irreplaceable file inside the folder an update overwrites.
    const host = readFileSync(
      join(ROOT, "installer/host/SeoToolHost.cs"),
      "utf8",
    );
    const sets = [...host.matchAll(/EnvironmentVariables\["SEO_DB_PATH"\]/g)];
    expect(
      sets.length,
      "SEO_DB_PATH must be set for BOTH the migration and the server, or they use different databases",
    ).toBe(2);
    expect(host).toMatch(/static string DbPath\(\)/);

    // And the two paths must come from the same place.
    expect(host).toMatch(/DbPath\(\)\s*=>\s*Path\.Combine\(DataDir\(\)/);
  });

  it("the db client and the migration runner agree on the variable", () => {
    // If either stops reading SEO_DB_PATH, the host's two env vars stop
    // pointing at one database and both commands still succeed — which
    // is worse than a failure, because the migration appears to work.
    const client = readFileSync(join(ROOT, "src/db/client.ts"), "utf8");
    const migrate = readFileSync(join(ROOT, "scripts/migrate.cjs"), "utf8");
    expect(client).toContain("SEO_DB_PATH");
    expect(migrate).toContain("SEO_DB_PATH");
  });

  it("the wizard artwork is generated, and CI generates it", () => {
    // The .iss references installer/art/*.bmp, which is not committed —
    // it is built from public/icon-512.png so it cannot drift from the
    // app's own mark. That only works if something builds it before
    // ISCC runs, and ISCC's failure for a missing WizardImageFile is
    // the same abort that cost a full four-runner build over the icon.
    expect(src).toMatch(/^WizardImageFile=.*art[\\/]/m);
    expect(src).toMatch(/^WizardSmallImageFile=.*art[\\/]/m);

    expect(
      existsSync(join(ROOT, "scripts/build-installer-art.mjs")),
      "the .iss wants generated artwork and the generator is gone",
    ).toBe(true);

    const wf = readFileSync(
      join(ROOT, ".github/workflows/installer.yml"),
      "utf8",
    );
    expect(wf, "CI never builds the wizard artwork").toContain(
      "build-installer-art.mjs",
    );
    // Before ISCC, or the compile aborts on a file that does not exist.
    const art = wf.indexOf("build-installer-art.mjs");
    const iscc = wf.indexOf("ISCC.exe");
    expect(art).toBeGreaterThan(-1);
    expect(art, "the artwork is built after the installer is compiled").toBeLessThan(
      iscc,
    );
  });

  it("the art generator refuses a format it cannot decode", () => {
    // It hand-decodes PNG because sharp is not a direct dependency.
    // A decoder that guesses at palette, 16-bit or interlaced data
    // produces a panel of plausible garbage, and nobody opens a .bmp
    // to check.
    const gen = readFileSync(
      join(ROOT, "scripts/build-installer-art.mjs"),
      "utf8",
    );
    expect(gen).toMatch(/bit depth .*expected 8|bitDepth !== 8/);
    expect(gen).toMatch(/colorType !== 6/);
    expect(gen).toMatch(/interlace/);
  });

  it("says 'update' when there is already a copy installed", () => {
    // Inno has no idea it is upgrading. DisableDirPage=auto and
    // DisableReadyPage=yes skip the PAGES on a second run, but every
    // word on the ones that remain still says install — "This will
    // install SEO Tool version 0.10.2 on your computer" — over a copy
    // the user already has.
    //
    // Reported as "all the time install software it never show me
    // update it always show install why", which is the right question:
    // the wording was the only thing saying it would replace rather
    // than update, and it was saying the wrong one.
    expect(src).toContain("function InstalledVersion");
    expect(src).toMatch(/WelcomeLabel1\.Caption\s*:=\s*'Update/);
    expect(src).toMatch(/FinishedHeadingLabel\.Caption\s*:=.*has been updated/);

    // Both registry hives: PrivilegesRequired=lowest writes to HKCU,
    // but an older build installed for all users leaves it in HKLM.
    expect(src).toContain("HKCU");
    expect(src).toContain("HKLM");

    // The promise the wording makes has to be the true one.
    expect(src).toMatch(/settings are kept|are not touched/);
  });

  it("is UTF-8 with a BOM, because the wizard text is not ASCII", () => {
    // Inno Setup 6 is Unicode, but WITHOUT a byte-order mark it reads
    // the .iss in the system codepage. The wizard now displays strings
    // containing an em-dash, and the copyright line contains ©; read as
    // CP1252 those become "â€”" and "Â©" in front of the user.
    //
    // An encoding bug is invisible on the machine that wrote the file
    // and appears on everyone else's, which is why it gets an assertion
    // rather than a convention.
    const bytes = readFileSync(ISS);
    const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    const nonAscii = [...src].some((c) => c.charCodeAt(0) > 127);
    if (nonAscii) {
      expect(
        hasBom,
        "the .iss contains non-ASCII text and has no UTF-8 BOM, so Inno will " +
          "read it in the system codepage and show mojibake",
      ).toBe(true);
    }
  });

  it("uses Inno's documented event signature", () => {
    // `procedure InitializeWizard();` with parentheses may compile and
    // simply never be called — the wizard then shows the install
    // wording with no error anywhere. The documented form has no
    // parentheses, and a silent no-fire is the failure this whole file
    // keeps running into.
    expect(src).toMatch(/procedure InitializeWizard;/);
    expect(src).not.toMatch(/procedure InitializeWizard\(\);/);
  });

  it("closes the running app itself rather than asking Inno to", () => {
    // MEASURED on a real update: CloseApplications=yes listed
    //
    //     SEO Tool
    //     Node.js JavaScript Runtime
    //
    // tried to close both, and dead-ended on "Setup was unable to
    // automatically close all applications" with Try again / Ignore /
    // Cancel. Inno closes an application by messaging its WINDOW, and
    // the node.exe server the host spawns has none, so it can never
    // respond. Ignoring would copy over a locked exe.
    //
    // Worse than what it replaced: before, the user simply got a
    // warning and could continue.
    expect(src).toMatch(/^CloseApplications=no$/m);
    expect(src).toContain("function StopRunningApp");

    // /T, or node survives and keeps the exe locked. And by the HOST's
    // image name — killing node.exe by name would end every unrelated
    // Node process on the machine.
    expect(src).toMatch(/taskkill/);
    expect(src).toMatch(/\/IM "SEO Tool\.exe" \/T/);
    expect(
      src,
      "never kill node.exe by image name — that is not ours to end",
    ).not.toMatch(/\/IM "?node\.exe/);

    // 128 is "no such process", which is the ordinary case.
    expect(src).toContain("128");
  });

  it("finds the Install button by caption, not by page id", () => {
    // Which page carries that button depends on which pages are
    // enabled: DisableReadyPage=yes moves it from Ready to Select
    // Tasks. Keying off wpReady would compile, run, and silently never
    // fire — the failure mode that is indistinguishable from not having
    // written it.
    expect(src).toMatch(
      /NextButton\.Caption\s*=\s*SetupMessage\(msgButtonInstall\)/,
    );
  });

  it("the host tells the user when the fault is ours", () => {
    // The lesson, encoded: a blanket catch turned our missing file into
    // "install WebView2", which the user had already done. The two
    // causes are distinguishable exceptions and must stay distinguished.
    const host = readFileSync(
      join(ROOT, "installer/host/SeoToolHost.cs"),
      "utf8",
    );
    expect(host).toContain("WebView2RuntimeNotFoundException");
    expect(host).toContain("DllNotFoundException");
    expect(
      host,
      "the DllNotFoundException branch must not send the user to install WebView2",
    ).toMatch(/DllNotFoundException\)[\s\S]{0,600}problem with the installer/);
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
