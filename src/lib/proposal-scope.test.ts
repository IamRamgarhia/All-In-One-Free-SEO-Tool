import { describe, expect, it } from "vitest";
import {
  deriveScope,
  unmappedFindingTypes,
  WORK_ITEMS,
  type Finding,
} from "./proposal-scope";

/**
 * A proposal is the one document a prospect keeps and holds you to. The
 * failure mode here isn't a crash — it's a scope line for work the site
 * doesn't need, or a promise nothing can support. Both read as
 * professional and both cost the freelancer the deal, or worse, the
 * relationship after they win it.
 */

const f = (type: string, severity = "medium"): Finding => ({ type, severity });

describe("deriveScope", () => {
  it("only returns work the findings actually support", () => {
    const scope = deriveScope([f("missing_title"), f("missing_title")]);
    expect(scope).toHaveLength(1);
    expect(scope[0].label).toMatch(/titles and meta descriptions/i);
    expect(scope[0].findings).toBe(2);
  });

  it("returns nothing for a clean site", () => {
    // A proposal padded with work the site doesn't need is the thing
    // prospects notice and stop trusting.
    expect(deriveScope([])).toEqual([]);
  });

  it("counts findings per line, not per type", () => {
    const scope = deriveScope([
      f("missing_title"),
      f("long_title"),
      f("missing_meta_description"),
    ]);
    expect(scope).toHaveLength(1);
    expect(scope[0].findings).toBe(3);
  });

  it("separates distinct pieces of work", () => {
    const scope = deriveScope([f("missing_title"), f("missing_schema")]);
    expect(scope).toHaveLength(2);
    expect(scope.map((s) => s.findings)).toEqual([1, 1]);
  });

  it("puts crawl blockers before content polish", () => {
    // Order is the order the work should be done in. A proposal that
    // reads out of sequence invites the question of whether its author
    // thought about it.
    const scope = deriveScope([f("thin_content"), f("noindex_set")]);
    expect(scope[0].label).toMatch(/indexability|crawl/i);
  });

  it("ignores finding types it doesn't recognise", () => {
    expect(deriveScope([f("some_future_check")])).toEqual([]);
  });
});

describe("no invented promises", () => {
  it("never forecasts traffic, rankings or revenue", () => {
    // The line this module must not cross. None of these can be
    // predicted from a crawl, and a proposal is where an unfounded
    // number does the most damage.
    const text = WORK_ITEMS.map((i) => `${i.label} ${i.detail}`).join(" ");
    const forbidden = [
      /\b\d+\s*%/, // "increase by 30%"
      /\bguarantee/i,
      /\bwill (increase|improve|boost|double|triple)\b/i,
      /\bfirst page\b/i,
      /\brank(ing)? (first|#1|number one)\b/i,
      /\bROI\b/,
      /\bmore traffic\b/i,
    ];
    for (const pattern of forbidden) {
      expect(text, `matched ${pattern}`).not.toMatch(pattern);
    }
  });

  it("never estimates hours or effort", () => {
    // We don't know how fast this person works, or what their client's
    // CMS is like. A number here becomes a deadline.
    const text = WORK_ITEMS.map((i) => i.detail).join(" ");
    expect(text).not.toMatch(/\b\d+\s*(hours?|hrs?|days?|weeks?)\b/i);
  });

  it("admits platform limits rather than over-promising", () => {
    // CLAUDE.md is explicit that some platforms have speed ceilings you
    // can't fix, and that the tool should say so.
    const speed = WORK_ITEMS.find((i) => /speed/i.test(i.label));
    expect(speed?.detail).toMatch(/depends on the platform|controllable/i);
  });
});

describe("work items are well-formed", () => {
  it("every item has a label, a real explanation, and types", () => {
    for (const item of WORK_ITEMS) {
      expect(item.label.length, item.label).toBeGreaterThan(5);
      // Long enough to be worth reading. A five-word line in a proposal
      // is filler.
      expect(item.detail.length, item.label).toBeGreaterThan(60);
      expect(item.types.length, item.label).toBeGreaterThan(0);
    }
  });

  it("no finding type appears in two work items", () => {
    // Otherwise one finding would be billed twice, in two scope lines —
    // which a prospect reading carefully would spot.
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const item of WORK_ITEMS) {
      for (const t of item.types) {
        if (seen.has(t)) dupes.push(t);
        seen.add(t);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("no duplicate labels", () => {
    const labels = WORK_ITEMS.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("unmappedFindingTypes", () => {
  it("reports types we couldn't scope, so nothing is silently dropped", () => {
    // If the audit grows a check this file doesn't know about, the
    // proposal understates the work. The person sending it should be
    // the one deciding what to do about that.
    const unmapped = unmappedFindingTypes([
      f("missing_title"),
      f("brand_new_check"),
      f("another_new_one"),
      f("brand_new_check"),
    ]);
    expect(unmapped).toEqual(["another_new_one", "brand_new_check"]);
  });

  it("is empty when everything mapped", () => {
    expect(unmappedFindingTypes([f("missing_title")])).toEqual([]);
  });
});
