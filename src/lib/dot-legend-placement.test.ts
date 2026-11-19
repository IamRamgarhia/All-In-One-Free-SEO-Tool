/**
 * The dot legend lives next to its dots, and in exactly one place.
 *
 * WHY: `ToolDotLegend` explains what the green/amber dots on tool
 * entries mean. It was rendered BOTH in the global top bar and in the
 * per-client tools panel — so a colour code for dots that are not in
 * the top bar was shown on every page, including pages with no dots on
 * them at all, while the panel that actually carries a column of dots
 * had its own copy two inches below.
 *
 * This is the third time this exact shape has been found in this
 * codebase, and the project's standing rule names it: never a second
 * copy of something that already exists, and that goes for CONTROLS and
 * labels, not just lists. Until 30 Oct 2026 the foot of the sidebar
 * carried its own profile block and its own guided/pro toggle while the
 * top bar already had both — and the two copies had drifted into
 * different wording for the same switch.
 *
 * Asserting only that the legend exists somewhere would pass with the
 * duplicate still in place, which is the mistake `e2e/shell.spec.ts`
 * records for the earlier case. So this counts render sites.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Every .tsx under src, walked rather than globbed. */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) tsxFiles(full, out);
    else if (e.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Files that RENDER <ToolDotLegend />, not ones that merely import it. */
function renderSites(): string[] {
  const out: string[] = [];
  for (const full of tsxFiles(join(ROOT, "src"))) {
    if (full.endsWith("tool-dot.tsx")) continue; // where it is defined
    const src = readFileSync(full, "utf8");
    // A JSX use, not the import line.
    if (/<ToolDotLegend[\s/>]/.test(src)) {
      out.push(relative(ROOT, full).replace(/\\/g, "/"));
    }
  }
  return out.sort();
}

describe("the tool dot legend", () => {
  it("is rendered somewhere, or this test proves nothing", () => {
    expect(renderSites().length).toBeGreaterThan(0);
  });

  it("is rendered in exactly one place", () => {
    const sites = renderSites();
    expect(
      sites,
      `ToolDotLegend is rendered in ${sites.length} places:\n  ${sites.join(
        "\n  ",
      )}\nA legend belongs beside the dots it describes. Two copies drift, ` +
        `and the one in global chrome explains a colour code for dots that ` +
        `are not there.`,
    ).toHaveLength(1);
  });

  it("is the per-client tools panel, which is where the dots are", () => {
    expect(renderSites()[0]).toContain("client-tools-sidebar");
  });

  it("is not in the top bar", () => {
    // Named explicitly, because that is where it was and where it would
    // plausibly be put back.
    const topBar = readFileSync(
      join(ROOT, "src/components/shell/top-bar.tsx"),
      "utf8",
    );
    expect(topBar).not.toMatch(/<ToolDotLegend[\s/>]/);
  });
});
