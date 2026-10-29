/**
 * The app must not tell people the wrong license.
 *
 * The /about page described this project as PolyForm Noncommercial for
 * months after it moved to MIT in June 2026. It said, in a styled panel with
 * a red column, that you could not sell the software or run it as a paid
 * service — both of which MIT expressly permits. Anyone who read it came away
 * believing they had fewer rights than they do, and nothing in the build
 * disagreed with it, because LICENSE and that page had no connection.
 *
 * This is the connection. LICENSE is the source of truth; every place that
 * names a license has to match it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Files that make a license claim to a human. */
const CLAIMING_FILES = [
  "src/app/about/page.tsx",
  "README.md",
  "src/lib/maintainer.ts",
];

describe("the license this project claims", () => {
  const license = read("LICENSE");

  it("LICENSE really is MIT, so the rest of this file means something", () => {
    // Guards the guard: if the project relicenses, this test should fail
    // loudly and be rewritten, not quietly keep asserting the old answer.
    expect(license).toMatch(/^MIT License/);
  });

  it("package.json agrees with LICENSE", () => {
    const pkg = JSON.parse(read("package.json")) as { license?: string };
    expect(pkg.license).toBe("MIT");
  });

  it("no user-facing file still claims a noncommercial license", () => {
    const offenders: string[] = [];
    for (const file of CLAIMING_FILES) {
      const src = read(file);
      // Matches the license NAME and the polyformproject.org links. The
      // word "noncommercial" on its own is allowed, so a sentence about
      // the project's history can stay.
      const claims = [
        /PolyForm\s+Noncommercial/i,
        /polyformproject\.org/i,
        /AGPL/,
      ].filter((re) => re.test(src));
      if (claims.length) offenders.push(`${file}: ${claims.join(", ")}`);
    }
    expect(
      offenders,
      "LICENSE is MIT, but these still name a different license",
    ).toEqual([]);
  });

  /**
   * The about page used to carry a License panel and it has been removed.
   * The claim itself still has to live somewhere a user can reach, and
   * that is now the README and the LICENSE file it links to — so this
   * guards there instead of quietly going away with the panel.
   */
  it("the README names MIT and links the license file", () => {
    const readme = read("README.md");
    expect(readme).toMatch(/MIT/);
    expect(readme).toMatch(/\]\(LICENSE\)/);
  });

  it("the about page left no dead link where the license panel was", () => {
    // Removing a section and leaving the links to it is the quiet kind of
    // broken: nothing errors, the click just does nothing.
    const about = read("src/app/about/page.tsx");
    const hasPanel = /id="license"/.test(about);
    const linksToPanel = /href="#license"/.test(about);
    expect(
      linksToPanel && !hasPanel,
      'the page links to #license but has no id="license" to land on',
    ).toBe(false);
  });

  it("the about page still points at the real license somewhere", () => {
    // Not a panel restating the terms — just a way to reach the file.
    const about = read("src/app/about/page.tsx");
    expect(about).toMatch(/blob\/main\/LICENSE|MIT-licensed/);
  });

  it("the about page does not promise a commercial license to buy", () => {
    // There isn't one. Offering to sell what MIT already gives away for
    // free is the most expensive kind of wrong text in the app.
    const about = read("src/app/about/page.tsx");
    expect(about).not.toMatch(/commercial licensing/i);
    expect(about).not.toMatch(/per-deployment, not per-seat/i);
  });
});
