import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TOOL_FINDING_MAP,
  mapToolFinding,
  urlInSignature,
} from "./tool-finding-map";
import { isPlannableFindingType } from "../audit-finding-types";
import { findingDraftsFor } from "@/lib/ai-robots-findings";

/**
 * The bridge between what the tools find and what the agent can fix.
 *
 * Both ends of this can rot independently and neither rots loudly. A
 * tool renames a signature and its findings stop mapping — nothing
 * errors, the agent just quietly stops acting on them. The map names a
 * finding type the planner cannot fix and the mapping is dead weight
 * that looks like coverage.
 */

/**
 * Every signature a source file can produce.
 *
 * Two shapes. Most are written out in full. Some are built from a prefix
 * and the finding's own type — `signature: \`health-check.${f.type}\`` —
 * and for those the literal string never appears anywhere, so a naive
 * scan reads every such mapping as an orphan.
 *
 * The prefix comes from the template and the suffixes from the type
 * names that same file produces, which keeps the guarantee this test
 * exists for: rename a type and its signature stops being emitted, so
 * the mapping shows up as the orphan it now is.
 */
function signaturesIn(src: string): string[] {
  const literal = [...src.matchAll(/signature:\s*"([^"]+)"/g)].map((m) => m[1]);

  // The dotted prefix in front of the interpolation, e.g. "health-check"
  // or "redirects-bulk.chain".
  const prefixes = [
    ...src.matchAll(/signature:\s*`([a-z0-9-]+(?:\.[a-z0-9_-]+)*)\.\$\{/g),
  ].map((m) => m[1]);

  const types = [...src.matchAll(/\btype:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);

  // Two shapes of interpolation, and both are legitimately emitted.
  //
  // The suffix is a finding TYPE — `health-check.${f.type}` — in which
  // case the whole signature is the prefix plus one of the type names
  // that file produces, and the map keys on the whole thing.
  //
  // Or the suffix is a per-item value like a URL, in which case the map
  // keys on the prefix alone and mapToolFinding matches it as a stem. So
  // the prefix itself counts as emitted.
  const templated = prefixes.flatMap((p) => types.map((t) => `${p}.${t}`));

  return [...literal, ...templated, ...prefixes];
}

describe("the map points at things that exist on both ends", () => {
  it("every target is a real finding type", () => {
    // Plannable, not crawler-only. The redirect tracer and the Core Web
    // Vitals tool produce real finding types the crawler never emits, so
    // gating on the crawler's list alone rejected a mapping that works.
    const unreal = Object.values(TOOL_FINDING_MAP).filter(
      (t) => !isPlannableFindingType(t),
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
    const sources = [
      "src/lib/ai-robots-findings.ts",
      "src/app/tools/health-check/actions.ts",
      "src/app/tools/redirects-bulk/actions.ts",
    ].map((p) => readFileSync(join(process.cwd(), p), "utf8"));

    const emitted = new Set(sources.flatMap(signaturesIn));
    const orphans = Object.keys(TOOL_FINDING_MAP).filter((s) => !emitted.has(s));
    expect(
      orphans,
      `${orphans.join(", ")} is mapped but no tool emits it. Either the ` +
        `signature was renamed, or the mapping was written for a tool that ` +
        `was never wired up.`,
    ).toEqual([]);
  });
});

describe("the URL a per-item signature carries", () => {
  it("pulls the address out of a bulk tool's signature", () => {
    // Without this every finding from a bulk run reports the same null
    // URL, and the dedup collapses a hundred redirect chains into one
    // action. Nothing errors; ninety-nine problems just never get fixed.
    expect(urlInSignature("redirects-bulk.chain.https://example.com/old")).toBe(
      "https://example.com/old",
    );
  });

  it("keeps a query string, because two URLs can differ only there", () => {
    expect(
      urlInSignature("redirects-bulk.chain.https://example.com/p?id=2"),
    ).toBe("https://example.com/p?id=2");
  });

  it("returns null for an ordinary signature", () => {
    // The common case: a per-page tool records one run for one URL, and
    // the run's own input is the right place to read it from.
    expect(urlInSignature("ai-robots.unaddressed")).toBeNull();
    expect(urlInSignature("health-check.redirect_chain")).toBeNull();
  });

  it("returns null rather than throwing on something unparseable", () => {
    expect(urlInSignature("tool.x.http://")).toBeNull();
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
    expect(findingDraftsFor(audit(8, 0))).toEqual([]);
  });

  it("records the 'nothing decided' case with the mapped signature", () => {
    const drafts = findingDraftsFor(audit(8, 8));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].signature).toBe("ai-robots.unaddressed");
    expect(mapToolFinding(drafts[0].signature)).toBe(
      "missing_ai_crawler_policy",
    );
  });

  it("distinguishes partial coverage rather than flattening it", () => {
    // Different crawler finding, different weight. Collapsing both into
    // one row would lose that.
    const drafts = findingDraftsFor(audit(8, 3));
    expect(drafts[0].signature).toBe("ai-robots.partial");
    expect(mapToolFinding(drafts[0].signature)).toBe(
      "partial_ai_crawler_policy",
    );
    expect(drafts[0].title).toContain("3 of 8");
  });
});
