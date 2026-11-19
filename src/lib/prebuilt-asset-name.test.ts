/**
 * The packager and the one-liner must build the SAME filename.
 *
 * WHY THIS TEST EXISTS: three places construct the prebuilt payload's
 * name, in two languages.
 *
 *   scripts/build-prebuilt-zip.mjs   writes it   (prebuiltAssetName)
 *   install-prebuilt.sh              asks for it (WANT=…)
 *   scripts/install-prebuilt-check.sh fakes it   (a 9.9.9 fixture)
 *
 * The one-liner matches by EXACT name, deliberately: "take the first
 * .zip" is the bug that shipped in v0.10.0's updater, which downloaded
 * the 30 KB WordPress plugin because it sorts first. So an exact match
 * is right — and it also means any disagreement between the writer and
 * the reader is total. Not a warning, not a slower path: "Release
 * v0.10.2 carries no prebuilt payload at all", on a release that
 * carries three.
 *
 * And both existing tests would still pass. install-prebuilt-check.sh
 * serves a fixture named by its OWN copy of the pattern, so it proves
 * the installer agrees with the test rather than with the packager.
 * That is the shape of a pair that has already drifted everywhere else
 * in this codebase.
 *
 * This asserts the shell template and the JavaScript function produce
 * byte-identical names once the shell's substitutions are made.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prebuiltAssetName } from "../../scripts/build-prebuilt-zip.mjs";

const ROOT = process.cwd();

/** The `WANT=` line from install-prebuilt.sh, unquoted. */
function shellTemplate(file: string): string {
  const src = readFileSync(join(ROOT, file), "utf8");
  const m = src.match(/^WANT="([^"]+)"$/m);
  expect(m, `no WANT="…" line in ${file}`).toBeTruthy();
  return m![1];
}

/**
 * Evaluate the shell template for one platform, by substituting what
 * each expression would print.
 *
 * Not a shell: `sh` is absent on a Windows dev machine, and a test that
 * silently skips there is worse than one that does the substitution in
 * the open where it can be read.
 */
function renderShell(
  template: string,
  { tag, unameS, unameM, nodeMajor }: {
    tag: string;
    unameS: string;
    unameM: string;
    nodeMajor: number;
  },
): string {
  let out = template;
  // ${TAG#v} — strip a leading v.
  out = out.replace("${TAG#v}", tag.replace(/^v/, ""));
  // $(uname -s | tr '[:upper:]' '[:lower:]')
  out = out.replace(
    "$(uname -s | tr '[:upper:]' '[:lower:]')",
    unameS.toLowerCase(),
  );
  out = out.replace("$(uname -m)", unameM);
  out = out.replace("${NODE_MAJOR}", String(nodeMajor));
  return out;
}

describe("the prebuilt asset name", () => {
  const template = shellTemplate("install-prebuilt.sh");

  it("has no unsubstituted shell left after rendering", () => {
    // The guard against this whole test going vacuous: if the template
    // changes to use a variable this renderer does not know, the
    // comparison below would pass or fail for reasons unrelated to the
    // names agreeing. A leftover `$` means the renderer is out of date.
    const rendered = renderShell(template, {
      tag: "v1.2.3",
      unameS: "Darwin",
      unameM: "arm64",
      nodeMajor: 22,
    });
    expect(rendered, `unsubstituted shell in: ${rendered}`).not.toMatch(/[$(){}]/);
  });

  // The three platforms the installer workflow builds. `uname -m`
  // words, not Node's: Node says "x64" where uname says "x86_64",
  // which is exactly the near-miss that produces a 404 nobody can
  // explain — so the pairs are written out rather than mapped.
  // `nodePlatform`/`nodeArch` are typed as the literals Node itself
  // uses, because build-prebuilt-zip.mjs's JSDoc narrows them — passing
  // a plain `string` is a typecheck error, which is the signature
  // catching exactly the near-miss this test is about.
  const cases: {
    unameS: string;
    unameM: string;
    nodePlatform: NodeJS.Platform;
    nodeArch: NodeJS.Architecture;
  }[] = [
    { unameS: "Darwin", unameM: "arm64", nodePlatform: "darwin", nodeArch: "arm64" },
    { unameS: "Darwin", unameM: "x86_64", nodePlatform: "darwin", nodeArch: "x64" },
    { unameS: "Linux", unameM: "x86_64", nodePlatform: "linux", nodeArch: "x64" },
  ];

  for (const c of cases) {
    it(`agrees for ${c.nodePlatform}/${c.nodeArch}`, () => {
      const written = prebuiltAssetName("1.2.3", c.nodePlatform, c.nodeArch, 22);
      const wanted = renderShell(template, {
        tag: "v1.2.3",
        unameS: c.unameS,
        unameM: c.unameM,
        nodeMajor: 22,
      });
      expect(
        wanted,
        `install-prebuilt.sh would ask the release API for a file the ` +
          `packager does not produce, and the one-liner matches by exact ` +
          `name — so this is "no prebuilt payload at all", not a fallback.`,
      ).toBe(written);
    });
  }

  it("the local check's fixture uses the same shape", () => {
    // install-prebuilt-check.sh builds its fake asset's name itself. If
    // that copy drifts, the check keeps passing while proving only that
    // the installer agrees with the test.
    const fixture = shellTemplate("scripts/install-prebuilt-check.sh");
    const rendered = renderShell(
      fixture.replace("9.9.9", "${TAG#v}"),
      { tag: "v1.2.3", unameS: "Linux", unameM: "x86_64", nodeMajor: 22 },
    );
    expect(rendered).toBe(prebuiltAssetName("1.2.3", "linux", "x64", 22));
  });

  it("strips a leading v so a tag and a version produce one name", () => {
    // The release tag is `v0.10.2` and package.json is `0.10.2`. A name
    // built from the tag unstripped would be seo-tool-prebuilt-v0.10.2-…
    expect(prebuiltAssetName("v1.2.3", "linux", "x64", 22)).toBe(
      prebuiltAssetName("1.2.3", "linux", "x64", 22),
    );
  });

  it("carries the Node major, because the ABI is not portable", () => {
    // Node 20 is ABI 115, 22 is 127, 24 is 137, 26 is 147. A payload
    // from the wrong one fails at startup with ERR_DLOPEN_FAILED, which
    // reads as a corrupt download.
    expect(prebuiltAssetName("1.2.3", "linux", "x64", 22)).toContain("node22");
    expect(prebuiltAssetName("1.2.3", "linux", "x64", 24)).toContain("node24");
    expect(prebuiltAssetName("1.2.3", "linux", "x64", 22)).not.toBe(
      prebuiltAssetName("1.2.3", "linux", "x64", 24),
    );
  });
});
