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

  it("the about page tells people what MIT actually allows", () => {
    const about = read("src/app/about/page.tsx");
    expect(about).toMatch(/MIT license/i);
    // The two permissions the old text explicitly denied. If someone
    // rewrites this section, these are the claims that must survive.
    expect(about.toLowerCase()).toMatch(/sell it|or sell/);
    expect(about.toLowerCase()).toMatch(/paid hosted service|paid saas/);
  });

  it("the about page does not promise a commercial license to buy", () => {
    // There isn't one. Offering to sell what MIT already gives away for
    // free is the most expensive kind of wrong text in the app.
    const about = read("src/app/about/page.tsx");
    expect(about).not.toMatch(/commercial licensing/i);
    expect(about).not.toMatch(/per-deployment, not per-seat/i);
  });
});
