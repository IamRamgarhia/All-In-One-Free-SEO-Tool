import { describe, expect, it } from "vitest";
import { LEVEL_DESCRIPTIONS, LEVEL_LABELS, willAutoApply } from "./autonomy-levels";

/**
 * These decide whether the agent writes to someone's live website
 * without asking. Getting `willAutoApply` wrong in the permissive
 * direction means a client's pages get rewritten by a setting the user
 * thought was conservative — and they'd find out from the client, not
 * from us.
 */

describe("willAutoApply", () => {
  it("never acts on suggest, whatever the risk", () => {
    // "Suggest only" is the default and the promise it makes is
    // absolute: nothing reaches the site. A safe-risk exception here
    // would quietly break that promise for exactly the users who chose
    // the cautious setting.
    expect(willAutoApply("suggest", "safe")).toBe(false);
    expect(willAutoApply("suggest", "needs_review")).toBe(false);
  });

  it("never acts when off", () => {
    expect(willAutoApply("off", "safe")).toBe(false);
    expect(willAutoApply("off", "needs_review")).toBe(false);
  });

  it("apply_safe acts on measurable problems only", () => {
    expect(willAutoApply("apply_safe", "safe")).toBe(true);
    // The whole point of the level. A judgement call applied
    // automatically across forty pages is how you lose a client.
    expect(willAutoApply("apply_safe", "needs_review")).toBe(false);
  });

  it("apply_all acts on everything", () => {
    expect(willAutoApply("apply_all", "safe")).toBe(true);
    expect(willAutoApply("apply_all", "needs_review")).toBe(true);
  });
});

describe("level copy", () => {
  it("every level has a label and a description", () => {
    for (const level of ["off", "suggest", "apply_safe", "apply_all"] as const) {
      expect(LEVEL_LABELS[level]?.length, level).toBeGreaterThan(0);
      expect(LEVEL_DESCRIPTIONS[level]?.length, level).toBeGreaterThan(30);
    }
  });

  it("says plainly that suggest-only never touches the site", () => {
    // A user picking a level is making a trust decision, and the copy is
    // the only thing they have to go on.
    expect(LEVEL_DESCRIPTIONS.suggest).toMatch(/never changes anything/i);
  });

  it("warns that full autopilot reviews after the fact", () => {
    expect(LEVEL_DESCRIPTIONS.apply_all).toMatch(/after the fact/i);
  });

  it("promises undo where changes are made", () => {
    expect(LEVEL_DESCRIPTIONS.apply_safe).toMatch(/undo/i);
  });
});
