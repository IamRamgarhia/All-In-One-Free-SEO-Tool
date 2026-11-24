/**
 * Which finding types one page can confirm. "I fixed this — check it"
 * re-fetches a single page; a type that list wrongly includes would look
 * "gone" every time (the check that finds it never runs on one page) and
 * be resolved on no evidence. So the list is checked against the code
 * that actually produces each type.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAGE_CHECK_TYPES, TECH_PAGE_CHECK_TYPES } from "./audit";

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const typesIn = (text: string) =>
  [...new Set([...text.matchAll(/type: "([a-z0-9_]+)"/g)].map((m) => m[1]))].sort();

describe("the page-level finding types", () => {
  it("are exactly what checkPage emits", () => {
    const src = read("lib/audit.ts");
    const start = src.indexOf("export function checkPage(");
    // checkPage ends where the next top-level declaration begins.
    const end = src.indexOf("\nfunction ", start + 1);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect([...PAGE_CHECK_TYPES].sort()).toEqual(typesIn(src.slice(start, end)));
  });

  it("include every per-technology check, which also runs page by page", () => {
    expect([...TECH_PAGE_CHECK_TYPES].sort()).toEqual(typesIn(read("lib/tech-audit-rules.ts")));
  });

  it("leave out what compares pages or describes the whole site", () => {
    for (const t of ["duplicate_title", "duplicate_meta_description", "orphan_pages", "missing_sitemap", "missing_security_headers", "missing_robots_txt"]) {
      expect(PAGE_CHECK_TYPES).not.toContain(t);
    }
  });
});
