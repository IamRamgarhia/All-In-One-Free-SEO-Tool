/**
 * `bin/STOP.sh` must not report an outcome it has not checked.
 *
 * MEASURED 19 Nov 2026, both directions within one minute:
 *
 *   1. It printed "No running SEO Tool was found (nothing to stop)"
 *      while PID 7524 was serving :3000 from this very install. Cause:
 *      it read `.seo-port` and then called `lsof`, and Git Bash on
 *      Windows has no `lsof` — so the entire fallback was skipped and
 *      the absence of a result printed as the absence of an app.
 *
 *   2. Pointed at the right pid, it printed "Stopped SEO Tool on port
 *      3000 (PID 7524)" and the app answered a second later. Cause:
 *      Git Bash's `kill` speaks MSYS pids, so `kill -TERM` against a
 *      native Windows pid signals nothing — and `kill -0` on that pid
 *      then reports the process gone, so the force-kill branch was
 *      skipped too. Every step reported success and nothing happened.
 *
 * Both are confident wrong answers from the one control a non-terminal
 * user has for stopping the app, which this project treats as worse
 * than a crash. The shell is not unit-testable here, so these assert
 * the structure that makes those two failures impossible:
 *
 *   - it asks the APP where it is (scripts/app-pid.mjs), not a file,
 *   - it uses taskkill on Windows, not `kill`,
 *   - it re-probes before claiming a stop,
 *   - and "could not look" prints differently from "nothing to stop".
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SH = readFileSync(join(process.cwd(), "bin/STOP.sh"), "utf8");

/**
 * The script with its comments removed.
 *
 * Needed because the comments in these files EXPLAIN the two bugs, and
 * so they name `lsof`, `netstat` and `kill`. A test that greps the raw
 * text therefore fails on the documentation of the fix — which is what
 * the first version of this file did, and it is the sort of test that
 * gets "fixed" by deleting the comment.
 */
function shellCode(src: string): string {
  return src
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

function jsCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

const SH_CODE = shellCode(SH);

describe("bin/STOP.sh", () => {
  it("has content to check, or this test proves nothing", () => {
    expect(SH.length).toBeGreaterThan(500);
    expect(SH).toContain("STOPPED");
  });

  it("asks the app where it is, through the shared probe", () => {
    // Not `.seo-port`, which records where START last PUT the app, and
    // not lsof, which does not exist on the platform most of this
    // project's users are on.
    expect(SH_CODE).toContain("scripts/app-pid.mjs");
    expect(
      SH_CODE,
      "lsof is absent in Git Bash — using it reintroduces bug 1",
    ).not.toContain("lsof");
  });

  it("uses taskkill on Windows, because `kill` cannot signal a Windows pid", () => {
    expect(SH).toMatch(/MINGW\*|MSYS\*/);
    // `//PID` with two slashes: MSYS rewrites a lone `/PID` into a path
    // before taskkill sees it.
    expect(SH).toContain("taskkill //PID");
    // The tree, not just the parent: the server spawns Playwright
    // browsers, and ending only the parent leaves headless Chrome with
    // no way for anyone to find it.
    expect(SH).toContain("//T");
  });

  it("re-probes before claiming it stopped anything", () => {
    // The assertion that would have caught bug 2. A claim of success
    // must come AFTER a check, not after a command that returned 0.
    const idx = SH_CODE.indexOf("Stopped SEO Tool on port");
    expect(idx).toBeGreaterThan(-1);
    const before = SH_CODE.slice(0, idx);
    expect(
      before,
      "the success message is printed without a re-probe above it",
    ).toMatch(/node scripts\/app-pid\.mjs[\s\S]{0,400}still answering/);
  });

  it("says 'could not look' differently from 'nothing to stop'", () => {
    // Bug 1 in one line. These two states must never share a message.
    expect(SH).toContain("nothing to stop");
    expect(SH).toMatch(/Could not check whether SEO Tool is running/);
    // And the one that could not look must not exit 0, or a caller
    // reads it as a successful stop.
    expect(SH).toMatch(/Could not check[\s\S]{0,300}exit 1/);
  });

  it("exits non-zero when the app survives", () => {
    expect(SH).toMatch(/still answering[\s\S]{0,200}exit 1/);
  });
});

describe("the shared probe", () => {
  it("is exported from app-port.mjs and used by both callers", async () => {
    // Rule 4: never a second copy. The probe lived inside
    // control-panel.mjs, STOP.sh had its own idea, and the two
    // disagreed about whether the app was running.
    const mod = await import("../../scripts/app-port.mjs");
    expect(typeof mod.findRunningApp).toBe("function");

    const panel = readFileSync(
      join(process.cwd(), "scripts/control-panel.mjs"),
      "utf8",
    );
    expect(panel).toContain("findRunningApp as probeRunningApp");
    expect(
      panel,
      "the panel has its own probeHealth again — that is the duplicate",
    ).not.toMatch(/^async function probeHealth\(/m);
  });

  it("reads the pid from the health response rather than mapping a port", () => {
    // Why this needs no netstat and no lsof: the app reports its own
    // pid, so there is no port-to-process lookup to get wrong per
    // platform.
    const cli = jsCode(
      readFileSync(join(process.cwd(), "scripts/app-pid.mjs"), "utf8"),
    );
    expect(cli).toContain("found.pid");
    expect(cli).not.toContain("netstat");
    expect(cli).not.toContain("lsof");
    // Exit 1 for "not found", so a caller can tell it apart from a
    // successful probe that printed nothing.
    expect(cli).toContain("process.exit(1)");
  });
});
