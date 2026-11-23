import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A layout is not an auth boundary: a client-side navigation between two
 * settings pages can render the page without running the layout again. So
 * every settings page checks access itself, before it reads anything.
 */

const OWNER_ONLY = new Set(["backup", "edge", "google", "serp"]);

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return name === "page.tsx" ? [full] : [];
  });
}

describe("settings pages", () => {
  const dir = path.join(process.cwd(), "src/app/settings");
  const files = pageFiles(dir);

  it("finds the pages", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    const rel = path.relative(dir, file);
    it(`checks access first in ${rel}`, () => {
      const src = readFileSync(file, "utf8");
      const body = src.slice(src.indexOf("export default async function"));
      const open = body.indexOf("{", body.indexOf(")"));
      const first = body.slice(open + 1).trimStart();
      expect(first).toMatch(/^(const me = )?await requireSettingsPage\(/);
      const owner = OWNER_ONLY.has(rel.split(path.sep)[0]);
      expect(/\{ owner: true \}/.test(first.split("\n")[0])).toBe(owner);
    });
  }
});
