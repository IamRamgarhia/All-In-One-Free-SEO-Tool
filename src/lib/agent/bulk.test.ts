/**
 * Approving a class of change at once.
 *
 * The convenience is the whole point and also the whole risk. Two
 * failures matter here and both are quiet:
 *
 * A site-wide kind leaking into a bulkable group. "Apply all" across
 * robots.txt or redirects is the one combination in this codebase that
 * can take a site off Google, and it would sit behind a button that
 * also does ninety harmless things.
 *
 * And a group counted as safe when it is not. One needs_review among
 * ninety safe ones makes the whole group a judgement call; deciding by
 * majority is how somebody approves a thing they would have refused.
 */

import { describe, expect, it, vi } from "vitest";
import { bulkableKind, groupForBulk, applyBulk, type BulkRow } from "./bulk";

const row = (over: Partial<BulkRow> = {}): BulkRow => ({
  id: Math.floor(Math.random() * 1e6),
  kind: "write_meta_description",
  risk: "safe",
  status: "queued",
  targetUrl: "https://example.com/a",
  afterValue: "A description",
  ...over,
});

describe("which kinds may be applied in bulk", () => {
  it("allows per-page kinds", () => {
    for (const k of ["write_title", "write_meta_description", "write_canonical"]) {
      expect(bulkableKind(k).ok, k).toBe(true);
    }
  });

  it("refuses every site-wide kind, and says why", () => {
    // There is one robots.txt. "Apply all" is meaningless for it and the
    // failure mode is a deindexed site.
    for (const k of ["write_robots_txt", "write_redirects", "write_hardening"]) {
      const g = bulkableKind(k);
      expect(g.ok, k).toBe(false);
      expect(g.reason, k).toBeTruthy();
    }
  });
});

describe("grouping what is waiting", () => {
  it("groups by kind and counts", () => {
    const groups = groupForBulk([
      row({ kind: "write_title" }),
      row({ kind: "write_title" }),
      row({ kind: "write_meta_description" }),
    ]);
    expect(groups.map((g) => [g.kind, g.count])).toEqual([
      ["write_title", 2],
      ["write_meta_description", 1],
    ]);
  });

  it("puts the biggest group first", () => {
    // The point of the feature is the group that would otherwise take
    // ten days of clicking.
    const groups = groupForBulk([
      row({ kind: "write_title" }),
      ...Array.from({ length: 5 }, () => row({ kind: "write_canonical" })),
    ]);
    expect(groups[0].kind).toBe("write_canonical");
  });

  it("calls a mixed group needs_review, not safe", () => {
    // The assertion that stops a majority vote deciding this.
    const groups = groupForBulk([
      ...Array.from({ length: 9 }, () => row({ risk: "safe" })),
      row({ risk: "needs_review" }),
    ]);
    expect(groups[0].risk).toBe("needs_review");
  });

  it("marks a site-wide group unbulkable rather than hiding it", () => {
    // Hiding it would leave the user wondering where their robots.txt
    // change went. It is shown, with the reason.
    const groups = groupForBulk([row({ kind: "write_robots_txt" })]);
    expect(groups[0].bulkable).toBe(false);
    expect(groups[0].reason).toMatch(/whole site/i);
  });

  it("ignores anything not waiting for approval", () => {
    expect(
      groupForBulk([
        row({ status: "applied" }),
        row({ status: "reverted" }),
        row({ status: "failed" }),
      ]),
    ).toEqual([]);
  });

  it("ignores actions with nothing to apply", () => {
    // A null value on the wire would become the string "null" in
    // somebody's meta description.
    expect(
      groupForBulk([row({ afterValue: null }), row({ targetUrl: null })]),
    ).toEqual([]);
  });

  it("shows a few examples so the user sees what they are agreeing to", () => {
    const groups = groupForBulk(
      Array.from({ length: 20 }, (_, i) =>
        row({ afterValue: `Description ${i}` }),
      ),
    );
    expect(groups[0].count).toBe(20);
    expect(groups[0].samples).toHaveLength(3);
    expect(groups[0].samples[0].afterValue).toBeTruthy();
  });
});

describe("applying a group", () => {
  const approve = () => vi.fn(async () => ({ ok: true }));

  it("refuses a site-wide kind without touching anything", async () => {
    const fn = approve();
    const r = await applyBulk({
      clientId: 1,
      kind: "write_robots_txt",
      approve: fn,
    });
    expect(fn).not.toHaveBeenCalled();
    expect(r.applied).toBe(0);
    expect(r.errors[0]).toMatch(/whole site/i);
  });
});
