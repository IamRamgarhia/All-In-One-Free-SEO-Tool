/**
 * The maintainer's tip jar must never appear on anything a client sees.
 *
 * This tool gets used in front of paying clients. A freelancer sends their
 * client a PDF report, or a magic link to the portal, or an invoice — and if
 * any of those carried "help fund this project, ₹300", the freelancer looks
 * like they are passing a hat round on someone else's behalf, on a document
 * they are charging for. The donation ask is the maintainer's to carry on the
 * maintainer's own screens, and nowhere else.
 *
 * The white-label `brand.*` settings exist precisely so the user's clients
 * see the user's branding. Leaking a support card through that is worse than
 * a styling bug: it costs the user credibility with someone who pays them.
 *
 * So this is a contract, not a convention. Adding the card to a client-facing
 * surface fails the build.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const allFiles = walk(path.join(ROOT, "src"))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => path.relative(ROOT, f).split(path.sep).join("/"));

/**
 * Everything a client can end up looking at: the portal they get a link to,
 * and every PDF or printable the user hands over.
 */
const CLIENT_FACING = allFiles.filter(
  (f) =>
    f.startsWith("src/app/portal/") ||
    f.startsWith("src/app/embed/") ||
    /\/pdf\//.test(f) ||
    /^src\/lib\/(proposal|plan)-pdf\.ts$/.test(f) ||
    f.startsWith("src/app/invoices/"),
);

/** Anything that asks for money or thanks supporters. */
const SUPPORT_IMPORTS = [
  "@/components/support/",
  "components/support/",
  "supporters-data",
  "MaintainerCredit",
  "SupportNudge",
  "upiDeepLink",
];

describe("the support ask is kept off client-facing surfaces", () => {
  it("found the client-facing files, so this test is checking something", () => {
    // Guards the guard. If the portal or the PDF routes move, this list
    // silently empties and every assertion below passes vacuously.
    expect(CLIENT_FACING.length).toBeGreaterThanOrEqual(6);
    expect(CLIENT_FACING.some((f) => f.startsWith("src/app/portal/"))).toBe(true);
    expect(CLIENT_FACING.some((f) => /\/pdf\//.test(f))).toBe(true);
    expect(CLIENT_FACING.some((f) => f.startsWith("src/app/invoices/"))).toBe(true);
  });

  it("no client-facing file pulls in the support ask", () => {
    const offenders: string[] = [];
    for (const file of CLIENT_FACING) {
      const src = readFileSync(path.join(ROOT, file), "utf8");
      const hits = SUPPORT_IMPORTS.filter((needle) => src.includes(needle));
      if (hits.length) offenders.push(`${file} -> ${hits.join(", ")}`);
    }
    expect(
      offenders,
      "a client would see the maintainer's donation ask on their own deliverable",
    ).toEqual([]);
  });

  it("the dashboard card is mounted in exactly one place", () => {
    // Put in the shared layout by mistake and it appears on all ~226
    // routes at once, including inside things being shown to a client.
    const mounts = allFiles.filter((f) => {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      return /<SupportNudgeSlot\b/.test(src);
    });
    expect(mounts).toEqual(["src/app/page.tsx"]);
  });

  it("the nudge is not in any layout", () => {
    const layouts = allFiles.filter((f) => /\/layout\.tsx$/.test(f));
    expect(layouts.length).toBeGreaterThan(0);
    for (const file of layouts) {
      const src = readFileSync(path.join(ROOT, file), "utf8");
      expect(src, file).not.toMatch(/SupportNudge/);
    }
  });
});
