import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TOOL_CAPABILITIES } from "./tool-capabilities.generated";

/**
 * Every link a generated task points at has to go somewhere.
 *
 * Tasks are created from templates and carry a `toolPath` — the "do it
 * here" link a user clicks from their task board. The path is a string,
 * so nothing typechecks it and nothing renders it until a real client
 * has a real task, which is why five of them were dead on a live board
 * before anyone noticed.
 *
 * Four broke when the content-writing routes moved out to BlogPilot: a
 * deletion that typechecked, built, and passed every test while leaving
 * a task board full of 404s. The fifth, /clients/N/plan, had never
 * existed at all.
 *
 * External links are allowed — writing genuinely lives in another tool
 * now — but an internal path has to resolve to a route this app serves.
 */

const TEMPLATE_FILES = readdirSync(join(process.cwd(), "src/lib"))
  .filter((f) => /(calendar|templates)\.ts$/.test(f) && !f.endsWith(".test.ts"))
  .map((f) => `src/lib/${f}`);

/** Route patterns the app actually serves, with dynamic bits wildcarded. */
const ROUTE_SHAPES = new Set(
  TOOL_CAPABILITIES.map((c) => c.route.replace(/\[[^\]]+\]/g, "*")),
);

/** A template's path with `${...}` interpolations wildcarded the same way. */
function shapeOf(raw: string): string {
  return raw
    .replace(/\$\{[^}]*\}/g, "*")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "") || "/";
}

describe("generated tasks link somewhere real", () => {
  it("finds the template files at all", () => {
    // If this list ever empties the rest of the suite passes vacuously.
    expect(TEMPLATE_FILES.length).toBeGreaterThan(0);
  });

  for (const file of TEMPLATE_FILES) {
    it(`${file} has no dead toolPath`, () => {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      const paths = [
        ...text.matchAll(/toolPath:\s*(?:input\.\w+\s*\?\s*)?[`"]([^`"]+)[`"]/g),
      ].map((m) => m[1]);

      const dead = paths
        .filter((raw) => !/^https?:\/\//i.test(raw))
        .filter((raw) => !ROUTE_SHAPES.has(shapeOf(raw)));

      expect(
        [...new Set(dead)],
        `These task templates link to routes this app does not serve, so ` +
          `the "do it here" button on a real task board is a 404. Point ` +
          `them at a route that exists, or at the tool that does the job ` +
          `now if it moved out.`,
      ).toEqual([]);
    });
  }
});
