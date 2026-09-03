import { describe, it, expect } from "vitest";
import { deriveToolCapabilities } from "./tool-capabilities.derive";
import { TOOL_CAPABILITIES } from "./tool-capabilities.generated";
import {
  badgeFor,
  capabilityOf,
  worksIn,
  AI_TOOL_COUNT,
  FREE_TOOL_COUNT,
  TOTAL_TOOL_COUNT,
} from "./tool-capabilities";

describe("tool capabilities", () => {
  it("the committed file still matches the code", () => {
    // If this fails, a page started or stopped using AI (or a browser) and
    // nobody regenerated the badges. Run `pnpm gen:capabilities`.
    // Left stale, the UI would tell users a paid tool is free.
    expect(deriveToolCapabilities()).toEqual(
      TOOL_CAPABILITIES.map((c) => ({ ...c })),
    );
  });

  it("finds a route from a real link target", () => {
    expect(capabilityOf("/tools/health-check")?.route).toBe(
      "/tools/health-check",
    );
    expect(capabilityOf("/tools/health-check?url=x")?.route).toBe(
      "/tools/health-check",
    );
    expect(capabilityOf("/tools/health-check#top")?.route).toBe(
      "/tools/health-check",
    );
    expect(capabilityOf("/tools/health-check/")?.route).toBe(
      "/tools/health-check",
    );
    expect(capabilityOf("/does-not-exist")).toBeNull();
  });

  it("covers sidebar routes, not just /tools/*", () => {
    // The sidebar links to plenty of pages that are not tools. Before the
    // table covered every route these all returned null, so the whole
    // sidebar rendered unbadged.
    for (const route of ["/agent", "/blog", "/reports", "/audits"]) {
      expect(capabilityOf(route), `${route} should be in the table`).not.toBeNull();
    }
  });

  it("knows image-gen costs money even though it skips ai-call", () => {
    // Regression: the first cut of the derivation treated lib/ai-call as the
    // only way to spend credits. image-gen.ts posts straight to OpenAI, so
    // it was labelled "Free" — a confidently wrong answer about money.
    expect(capabilityOf("/tools/image-gen")?.needsAI).toBe(true);
  });

  it("never charges for a page that does not call a model", () => {
    const free = TOOL_CAPABILITIES.filter((c) => !c.needsAI);
    for (const cap of free) {
      for (const mode of ["none", "mcp", "api", "both"] as const) {
        expect(badgeFor(cap, mode)?.tone).toBe("free");
        expect(worksIn(cap, mode)).toBe(true);
      }
    }
  });

  it("a subscription unlocks the AI tools, not just a key", () => {
    const ai = TOOL_CAPABILITIES.find((c) => c.needsAI)!;
    expect(worksIn(ai, "none")).toBe(false);
    expect(worksIn(ai, "mcp")).toBe(true);
    expect(worksIn(ai, "api")).toBe(true);
    expect(badgeFor(ai, "mcp")?.tone).toBe("chat");
  });

  it("counts only top-level tools, so the copy matches the grid", () => {
    // Nested routes like /tools/geo-swot/c/[clientId] are the same tool
    // seen from a client. Counting them would overstate the number.
    expect(TOTAL_TOOL_COUNT).toBe(AI_TOOL_COUNT + FREE_TOOL_COUNT);
    expect(TOTAL_TOOL_COUNT).toBeLessThan(TOOL_CAPABILITIES.length);
    expect(TOTAL_TOOL_COUNT).toBeGreaterThan(80);
  });

  it("every sidebar link resolves in the table", async () => {
    // The sidebar tags rows by looking each href up. A nav entry that
    // does not resolve is not an error anywhere — it just silently never
    // gets a tag, which is impossible to notice by looking at the UI.
    const { NAV_GROUPS } = await import("@/components/shell/nav-items");
    const missing = NAV_GROUPS.flatMap((g) => g.items)
      .map((i) => i.href)
      .filter((href) => capabilityOf(href) === null);
    expect(missing).toEqual([]);
  });
});
