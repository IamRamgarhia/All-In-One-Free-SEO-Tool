import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOL_FINDING_MAP, mapToolFinding } from "./tool-finding-map";
import { isAuditFindingType } from "../audit-finding-types";
import { findingRowsFor } from "@/lib/ai-robots-findings";

/**
 * The bridge between what the tools find and what the agent can fix.
 *
 * Both ends of this can rot independently and neither rots loudly. A
 * tool renames a signature and its findings stop mapping — nothing
 * errors, the agent just quietly stops acting on them. The map names a
 * finding type the planner cannot fix and the mapping is dead weight
 * that looks like coverage.
 */

describe("the map points at things that exist on both ends", () => {
  it("every target is a real finding type", () => {
    const unreal = Object.values(TOOL_FINDING_MAP).filter(
      (t) => !isAuditFindingType(t),
    );
    expect(
      unreal,
      `${unreal.join(", ")} is not a finding type, so nothing downstream ` +
        `can plan or explain it.`,
    ).toEqual([]);
  });

  it("every target is one the planner can actually fix", () => {
    // A mapping onto a finding the agent cannot fix produces nothing.
    // It is not harmful, but it reads as coverage and is not — so it
    // has to be a deliberate, visible choice rather than an oversight.
    const planner = readFileSync(
      join(process.cwd(), "src/lib/agent/planner.ts"),
      "utf8",
    );
    const start = planner.indexOf("const FIXABLE");
    const rest = planner.slice(start);
    const end = rest.search(/^\};/m);
    const fixable = new Set(
      [...(end === -1 ? rest : rest.slice(0, end)).matchAll(/^  ([a-z0-9_]+): \{/gm)].map(
        (m) => m[1],
      ),
    );

    const inert = Object.entries(TOOL_FINDING_MAP).filter(
      ([, type]) => !fixable.has(type),
    );
    expect(
      inert.map(([sig, type]) => `${sig} -> ${type}`),
      `These map onto findings the planner has no entry for, so a tool ` +
        `producing them still results in no action.`,
    ).toEqual([]);
  });

  it("every mapped signature is one a tool actually emits", () => {
    // The direction that rots silently: rename a signature in the tool
    // and the map keeps pointing at a string nothing produces.
    const sources = ["src/lib/ai-robots-findings.ts"].map((p) =>
      readFileSync(join(process.cwd(), p), "utf8"),
    );
    const emitted = new Set(
      sources.flatMap((src) =>
        [...src.matchAll(/signature:\s*"([^"]+)"/g)].map((m) => m[1]),
      ),
    );
    const orphans = Object.keys(TOOL_FINDING_MAP).filter((s) => !emitted.has(s));
    expect(
      orphans,
      `${orphans.join(", ")} is mapped but no tool emits it. Either the ` +
        `signature was renamed, or the mapping was written for a tool that ` +
        `was never wired up.`,
    ).toEqual([]);
  });
});

describe("resolving a signature", () => {
  it("matches exactly", () => {
    expect(mapToolFinding("ai-robots.unaddressed")).toBe("missing_ai_crawler_policy");
  });

  it("matches a namespaced child through its stem", () => {
    // A tool that appends a per-item suffix should still map.
    expect(mapToolFinding("ai-robots.unaddressed.GPTBot")).toBe(
      "missing_ai_crawler_policy",
    );
  });

  it("does not match a signature that merely starts with the same letters", () => {
    // "ai-robots.unaddressedness" is not a child of
    // "ai-robots.unaddressed" — the boundary is a dot, not a prefix.
    expect(mapToolFinding("ai-robots.unaddressedly")).toBeNull();
  });

  it("returns null for anything unmapped, which is the normal case", () => {
    // Most tool findings are judgements with no mechanical fix. Null is
    // the right answer, not a gap.
    expect(mapToolFinding("sxo.time_to_answer")).toBeNull();
    expect(mapToolFinding("")).toBeNull();
  });
});

describe("what the ai-robots tool records", () => {
  const bots = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ua: `Bot${i}`,
      vendor: "v",
      purpose: "p",
      docs: "d",
      status: "missing" as const,
      effectivelyBlocked: false,
    }));

  const audit = (total: number, unaddressed: number) =>
    ({
      ok: true as const,
      url: "https://example.test/",
      fetchedAt: new Date().toISOString(),
      rawBytes: 100,
      bots: bots(total),
      starDisallowsAll: false,
      suggestedPatch: "",
      unaddressedCount: unaddressed,
    });

  it("records nothing when every bot is already addressed", () => {
    // A green row on a checklist for work nobody has to do is noise, and
    // the agent's loader filters passes out anyway.
    expect(findingRowsFor(audit(8, 0), 1, 5)).toEqual([]);
  });

  it("records the 'nothing decided' case with the mapped signature", () => {
    const rows = findingRowsFor(audit(8, 8), 1, 5);
    expect(rows).toHaveLength(1);
    expect(rows[0].signature).toBe("ai-robots.unaddressed");
    expect(mapToolFinding(rows[0].signature)).toBe("missing_ai_crawler_policy");
    expect(rows[0].clientId).toBe(5);
  });

  it("distinguishes partial coverage rather than flattening it", () => {
    // Different crawler finding, different weight. Collapsing both into
    // one row would lose that.
    const rows = findingRowsFor(audit(8, 3), 1, 5);
    expect(rows[0].signature).toBe("ai-robots.partial");
    expect(mapToolFinding(rows[0].signature)).toBe("partial_ai_crawler_policy");
    expect(rows[0].title).toContain("3 of 8");
  });

  it("carries a null client through rather than inventing one", () => {
    // The tool can be run standalone. A finding with no client is
    // invisible to the agent, which plans per client — that is correct,
    // not a bug to paper over.
    expect(findingRowsFor(audit(8, 8), 1, null)[0].clientId).toBeNull();
  });
});
