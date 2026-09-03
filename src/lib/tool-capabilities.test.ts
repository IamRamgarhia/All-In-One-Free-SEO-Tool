import { describe, it, expect } from "vitest";
import { deriveToolCapabilities } from "./tool-capabilities.derive";
import { TOOL_CAPABILITIES } from "./tool-capabilities.generated";
import { badgeFor, capabilityOf, worksIn } from "./tool-capabilities";

describe("tool capabilities", () => {
  it("the committed file still matches the code", () => {
    // If this fails, a tool started or stopped using AI (or a browser) and
    // nobody regenerated the badges. Run `pnpm gen:capabilities`.
    // Left stale, the grid would tell users a paid tool is free.
    expect(deriveToolCapabilities()).toEqual(
      TOOL_CAPABILITIES.map((c) => ({ ...c })),
    );
  });

  it("finds a tool by slug or by href", () => {
    expect(capabilityOf("health-check")?.slug).toBe("health-check");
    expect(capabilityOf("/tools/health-check")?.slug).toBe("health-check");
    expect(capabilityOf("/tools/health-check?url=x")?.slug).toBe("health-check");
    expect(capabilityOf("/tools/does-not-exist")).toBeNull();
  });

  it("knows image-gen costs money even though it skips ai-call", () => {
    // Regression: the first cut of the derivation treated lib/ai-call as the
    // only way to spend credits. image-gen.ts posts straight to OpenAI, so
    // it was labelled "Free" — a confidently wrong answer about money.
    expect(capabilityOf("image-gen")?.needsAI).toBe(true);
  });

  it("never charges for a tool that does not call a model", () => {
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
});
