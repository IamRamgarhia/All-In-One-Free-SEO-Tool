/**
 * The transitive security pins are written twice, because two package
 * managers read two different fields, and only one of them was filled.
 *
 * Five advisories in this project are not fixable by bumping a direct
 * dependency — they live in transitive packages (`proxy-addr`,
 * `body-parser`, `fast-uri`, `browserslist`, `source-map-js`) that
 * something else chooses the version of. The fix is a resolution
 * override. pnpm reads those from `pnpm.overrides`. **npm does not** —
 * npm reads a top-level `overrides` and ignores `pnpm` entirely.
 *
 * That mattered because npm is a path real installs take, on supported
 * Node versions, without anyone choosing it:
 *
 *   - `engines` allows Node `>=20.11 <27`.
 *   - Node 25 and later do not ship corepack (nodejs/TSC vote, Mar 2025).
 *     On Node 25/26 a machine that never installed pnpm separately has
 *     no pnpm and no corepack to fetch one.
 *   - install.sh and install.ps1 then fall through to `PM="npm"`, which
 *     is the right call — better a working install than a hard stop.
 *   - But there is no `package-lock.json`, so npm resolves fresh from
 *     the registry, and with `pnpm.overrides` invisible to it, it
 *     reinstates exactly the five versions those overrides exist to keep
 *     out.
 *
 * Measured on this machine (Node 26.13.0, 19 Nov 2026): no corepack in
 * the Node distribution, no pnpm on PATH. That is not an exotic setup —
 * it is what anyone gets from a current nodejs.org installer.
 *
 * The install reports success either way. Nothing throws, nothing warns,
 * and the only difference is which versions ended up on disk — a
 * silent-wrong-answer bug in the project's own terms, and the reason the
 * duplicate exists at all.
 *
 * Rule 4 says never add a second hardcoded list of something that
 * already exists. Here the second copy is forced by npm's schema, so
 * this test is what keeps it from drifting: the same shape as
 * `docker-playwright-version.test.ts`, for the same reason.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Pkg = {
  engines?: { node?: string };
  overrides?: Record<string, string>;
  pnpm?: { overrides?: Record<string, string> };
};

const pkg: Pkg = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
);

describe("transitive security pins reach both package managers", () => {
  it("pnpm.overrides is not empty, or this test guards nothing", () => {
    // A vacuous pass is the failure mode here: if someone deletes
    // pnpm.overrides, every comparison below succeeds against {} and the
    // suite reports the pins as consistent while there are none.
    const pnpmOverrides = pkg.pnpm?.overrides ?? {};
    expect(Object.keys(pnpmOverrides).length).toBeGreaterThan(0);
  });

  it("every pnpm override has an identical top-level override for npm", () => {
    const pnpmOverrides = pkg.pnpm?.overrides ?? {};
    const npmOverrides = pkg.overrides ?? {};

    const missing = Object.keys(pnpmOverrides).filter(
      (name) => !(name in npmOverrides),
    );
    expect(
      missing,
      `${missing.join(", ")} is pinned in pnpm.overrides but absent from ` +
        `the top-level "overrides". npm never reads the pnpm block, so an ` +
        `npm install — which install.sh and install.ps1 fall back to on ` +
        `Node 25+, where corepack no longer ships — would resolve the ` +
        `vulnerable version and report success.`,
    ).toEqual([]);

    const disagree = Object.entries(pnpmOverrides)
      .filter(([name, spec]) => name in npmOverrides && npmOverrides[name] !== spec)
      .map(([name, spec]) => `${name}: pnpm wants ${spec}, npm has ${npmOverrides[name]}`);
    expect(
      disagree,
      `The two override blocks disagree:\n  ${disagree.join("\n  ")}\n` +
        `Which versions you end up with would then depend on which ` +
        `package manager ran, which is not something an install should ` +
        `decide for you.`,
    ).toEqual([]);
  });

  it("no top-level override exists that pnpm would ignore", () => {
    // The mirror has to hold in both directions. A pin added only to the
    // top-level block is invisible to pnpm, which is what CI, Docker and
    // every developer here actually run — so that one would be the
    // unprotected path instead.
    const pnpmOverrides = pkg.pnpm?.overrides ?? {};
    const npmOverrides = pkg.overrides ?? {};
    const orphans = Object.keys(npmOverrides).filter(
      (name) => !(name in pnpmOverrides),
    );
    expect(
      orphans,
      `${orphans.join(", ")} is pinned for npm but not in pnpm.overrides. ` +
        `pnpm is what this project installs with, so that pin does ` +
        `nothing where it matters most.`,
    ).toEqual([]);
  });
});

describe("the Node range and the install fallback agree", () => {
  it("if Node 25+ is supported, the npm fallback must carry the pins", () => {
    // The two facts are linked, and the link is the whole bug. Narrowing
    // `engines` to <25 would also be a valid fix, by removing the
    // corepack-less versions from the supported set. Either is fine —
    // what must not happen is supporting Node 25+ while only pnpm sees
    // the security pins.
    const range = pkg.engines?.node ?? "";
    const allowsCorepackLessNode = !/<\s*2[0-5](\.|\b)/.test(range);
    if (allowsCorepackLessNode) {
      expect(
        Object.keys(pkg.overrides ?? {}).length,
        `engines.node is "${range}", which allows Node 25+ — versions that ` +
          `ship no corepack, so installs there fall back to npm. The ` +
          `top-level "overrides" block cannot be empty on that range.`,
      ).toBeGreaterThan(0);
    }
  });
});
