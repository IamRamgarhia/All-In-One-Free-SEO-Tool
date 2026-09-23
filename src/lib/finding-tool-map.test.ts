/**
 * Every tool path here must be a real route.
 *
 * The failure is quiet and it is the whole risk of adding this map: a
 * typo does not throw, it renders a button that 404s. The user clicks,
 * lands on nothing, and concludes the tool is broken — which is a worse
 * outcome than the button never existing, because it costs the click
 * and the trust.
 *
 * This repo has been bitten by exactly this shape before: the swept-tool
 * list carries the same test for the same reason.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mappedFindingTypes,
  toolForFinding,
} from "./finding-tool-map";
import {
  AUDIT_FINDING_TYPES,
  NON_CRAWLER_FINDING_TYPES,
} from "./audit-finding-types";

const APP = join(process.cwd(), "src/app");

describe("the routes exist", () => {
  it("every mapped tool is a real page", () => {
    const broken: string[] = [];
    for (const type of mappedFindingTypes()) {
      const route = toolForFinding(type)!;
      // "/tools/robots" → src/app/tools/robots/page.tsx
      const page = join(APP, route.replace(/^\//, ""), "page.tsx");
      if (!existsSync(page)) broken.push(`${type} → ${route}`);
    }
    expect(
      broken,
      `These map to a route with no page, so the button 404s:\n  ${broken.join("\n  ")}`,
    ).toEqual([]);
  });

  it("maps at least one finding, so the test above can fail", () => {
    // Guards the guard. An empty map passes every assertion here.
    expect(mappedFindingTypes().length).toBeGreaterThan(20);
  });
});

describe("the finding types are real", () => {
  it("maps nothing the crawler never emits", () => {
    // A mapping for a type that does not exist is dead weight that reads
    // as coverage — the same inflation audit-finding-types.test.ts
    // exists to stop in the planner.
    const known = new Set<string>([
      ...AUDIT_FINDING_TYPES,
      ...NON_CRAWLER_FINDING_TYPES,
    ]);
    const unreal = mappedFindingTypes().filter((t) => !known.has(t));
    expect(
      unreal,
      `${unreal.join(", ")} is mapped to a tool but nothing emits it.`,
    ).toEqual([]);
  });
});

describe("what it declines to answer", () => {
  it("returns null rather than guessing", () => {
    expect(toolForFinding("not_a_real_finding")).toBeNull();
  });

  it("offers no tool for findings fixed in somebody else's repo", () => {
    // next_* and shopify_* findings are fixed in that platform's source,
    // not in this app. A button opening one of our tools would waste the
    // click and the trust.
    for (const t of ["next_raw_img_tags", "shopify_liquid_debug"]) {
      expect(toolForFinding(t), t).toBeNull();
    }
  });
});
