/**
 * Every runner label in every workflow must be one that still exists.
 *
 * WHY THIS TEST EXISTS: the installer workflow asked for `macos-13`,
 * which GitHub retired on 4 December 2025. That job did not fail. It sat
 * in "queued" for twelve minutes and never started, while the other
 * three jobs in the same run finished — and "queued" is exactly what a
 * job waiting for a busy runner looks like, so there is nothing on the
 * screen that says the label is dead. Nobody would notice for an hour.
 *
 * A typo behaves identically: `macos-15-inte` queues forever too. So a
 * denylist of retired labels is the wrong shape — it would catch the
 * retirement and miss the typo, which is the same bug. This is an
 * ALLOWLIST: every label the project uses has to be named here with a
 * reason, and anything else fails by name.
 *
 * That makes the test a nuisance exactly once per label, which is the
 * point. "Prefer bugs that crash over bugs that lie" — and a job stuck
 * in a queue is the quietest lie in CI.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW_DIR = join(process.cwd(), ".github/workflows");

/**
 * Labels this project is allowed to ask for, and why each one.
 *
 * Checked against GitHub's runner-images announcements on 19 Nov 2026.
 * This list cannot predict a future retirement — it makes the next one
 * a named test failure on the first run after someone updates it,
 * rather than a job that queues until the 60-minute timeout.
 */
const ALLOWED: Record<string, string> = {
  // Pinned, not `latest`: GitHub moved ubuntu-latest to 26.04, which
  // Playwright 1.59.1 refuses outright, and native modules built
  // against 26.04's glibc may not load on an older distro. 24.04 is
  // "noble", the same base as this project's Docker image.
  "ubuntu-24.04": "pinned for Playwright and for glibc portability",

  // Fine for jobs that only run node and shell — nothing in them cares
  // which Ubuntu it is, and tracking latest means no retirement work.
  "ubuntu-latest": "version-agnostic jobs only (no Playwright, no native build)",

  // arm64 macOS. `latest` is deliberate here: Apple Silicon is the
  // architecture that is not going away, so tracking it is safe.
  "macos-latest": "macOS arm64 payload",

  // The LAST x86_64 macOS image GitHub will publish, supported to
  // August 2027. macos-13 was the predecessor and is retired; see the
  // comment in installer.yml.
  "macos-15-intel": "macOS x86_64 payload (final Intel image)",

  // Windows is the installer's whole reason for existing and the image
  // carries both the .NET SDK and Inno Setup.
  "windows-latest": "the .exe: needs dotnet and ISCC",
};

/**
 * Labels GitHub has retired, listed so the failure message can say
 * "retired on <date>" instead of only "not allowed". Not the mechanism
 * — the allowlist above is.
 */
const RETIRED: Record<string, string> = {
  "macos-11": "retired 2024",
  "macos-12": "retired December 2024",
  "macos-13": "retired 4 December 2025 — use macos-15-intel",
  "ubuntu-18.04": "retired April 2023",
  "ubuntu-20.04": "retired April 2025",
  "windows-2016": "retired 2022",
  "windows-2019": "retired June 2025",
};

/** Every `runs-on:` value and every matrix `os:` value, with its file. */
function labelsInWorkflows(): { file: string; label: string; line: number }[] {
  const out: { file: string; label: string; line: number }[] = [];

  for (const file of readdirSync(WORKFLOW_DIR)) {
    if (!/\.ya?ml$/.test(file)) continue;
    const lines = readFileSync(join(WORKFLOW_DIR, file), "utf8").split("\n");

    lines.forEach((text, i) => {
      // `runs-on: ${{ matrix.os }}` is an indirection, not a label — the
      // matrix entries it reads are matched by the `os:` pattern below.
      const m =
        text.match(/^\s*runs-on:\s*([^\s#]+)\s*$/) ??
        text.match(/^\s*-?\s*os:\s*([^\s#]+)\s*$/);
      if (!m) return;
      const label = m[1].replace(/^["']|["']$/g, "");
      if (label.startsWith("${{")) return;
      out.push({ file, label, line: i + 1 });
    });
  }

  return out;
}

describe("workflow runner labels", () => {
  it("finds labels to check, or this test proves nothing", () => {
    // The risk is a vacuous pass: if the patterns stopped matching, the
    // assertion below would succeed against an empty list.
    const found = labelsInWorkflows();
    expect(found.length).toBeGreaterThanOrEqual(5);
    expect(new Set(found.map((f) => f.file)).size).toBeGreaterThanOrEqual(2);
  });

  it("every label is one that still exists", () => {
    const bad = labelsInWorkflows().filter((l) => !(l.label in ALLOWED));

    expect(
      bad.map((b) => `${b.file}:${b.line} ${b.label}`),
      bad.length === 0
        ? ""
        : `These runner labels are not in the allowlist. A label GitHub ` +
          `does not recognise does NOT fail the job — it queues forever, ` +
          `which looks the same as waiting for a busy runner:\n` +
          bad
            .map(
              (b) =>
                `  ${b.file}:${b.line} ${b.label}` +
                (RETIRED[b.label] ? ` — ${RETIRED[b.label]}` : " — unknown label, typo?"),
            )
            .join("\n") +
          `\n\nIf the label is real and new, add it to ALLOWED in this ` +
          `file with the reason it was chosen.`,
    ).toEqual([]);
  });

  it("the allowlist and the retired list cannot both claim a label", () => {
    // A label in both would mean someone added a retired one to ALLOWED
    // to silence this test, which is the one way to make it useless.
    const both = Object.keys(ALLOWED).filter((l) => l in RETIRED);
    expect(both, `${both.join(", ")} is allowed AND retired`).toEqual([]);
  });

  it("the payload matrix builds for three platforms", () => {
    // The macOS/Linux one-liner fetches a prebuilt payload per platform.
    // If a matrix entry is dropped, the installer for that platform
    // silently falls back to building from source — which works, slowly,
    // and so nobody reports it.
    const iw = readFileSync(join(WORKFLOW_DIR, "installer.yml"), "utf8");
    const names = [...iw.matchAll(/^\s+name:\s*(macOS arm64|macOS x86_64|Linux x86_64)\s*$/gm)];
    expect(names.map((n) => n[1]).sort()).toEqual([
      "Linux x86_64",
      "macOS arm64",
      "macOS x86_64",
    ]);
  });

  it("the checksums job expects as many payloads as the matrix builds", () => {
    // The checksums step warns when fewer payloads arrived than the
    // matrix should have produced, using a literal count. A fourth
    // platform added to the matrix and not there would make a 3-of-4
    // run report itself complete — which is the failure this whole file
    // exists to prevent: a quiet partial success.
    const iw = readFileSync(join(WORKFLOW_DIR, "installer.yml"), "utf8");
    const legs = [...iw.matchAll(/^\s+- os:\s*\S+\s*$/gm)].length;
    const expected = iw.match(/^\s+expected=(\d+)\s*$/m)?.[1];
    expect(expected, "no `expected=<n>` line in the checksums job").toBeTruthy();
    expect(Number(expected), `matrix has ${legs} legs`).toBe(legs);
  });
});
