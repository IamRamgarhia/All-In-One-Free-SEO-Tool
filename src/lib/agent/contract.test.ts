import { describe, expect, it } from "vitest";
import { FIXABLE } from "./planner";

/**
 * The contract between planning and doing.
 *
 * The agent shipped able to PLAN four kinds of change and able to WRITE
 * two. Capability detection was supposed to stop it planning work it
 * couldn't perform — and it didn't, because every WordPress write shared
 * one availability flag. So on any WordPress client with missing schema
 * or missing alt text, the agent planned an action that could never
 * succeed, every single run.
 *
 * Nothing errored loudly. The run log showed "failed" counts and the
 * user had no way to tell "your site rejected this" from "we can't
 * actually do this".
 *
 * This test is the guard: every kind the planner can produce must have a
 * declared position on whether the executor can carry it out. Adding a
 * new finding type to FIXABLE without deciding that is what caused the
 * bug, so it now fails the build.
 */

/**
 * Kinds the executor can actually write today.
 *
 * Keep in step with `writeField` in executor.ts. Deliberately a
 * hand-maintained list rather than something derived — the point is to
 * force a decision when someone adds a kind, not to auto-agree with
 * whatever the code happens to do.
 */
const EXECUTABLE = new Set([
  "write_title",
  "write_meta_description",
  "write_schema",
  // Plugin 0.3.0 supplies the attachment ids, and expandImageActions in
  // run.ts turns one page finding into one action per image. Gated on
  // the plugin version by capability detection.
  "write_image_alt",
]);

/**
 * Kinds the planner may produce that the executor cannot yet perform,
 * each with why. Anything here MUST be reported unavailable by
 * capability detection, so the planner filters it out before it reaches
 * the executor.
 */
const KNOWN_UNBUILDABLE: Record<string, string> = {};

describe("plan/execute contract", () => {
  it("every planned kind is either executable or explicitly not yet", () => {
    const kinds = [...new Set(Object.values(FIXABLE).map((f) => f.kind))];
    for (const kind of kinds) {
      const known = EXECUTABLE.has(kind) || kind in KNOWN_UNBUILDABLE;
      expect(
        known,
        `${kind} can be planned but nothing says whether the executor can do it. ` +
          `Either implement it in writeField and add it to EXECUTABLE, or add it ` +
          `to KNOWN_UNBUILDABLE and make capability detection report it unavailable.`,
      ).toBe(true);
    }
  });

  it("nothing is listed as both executable and unbuildable", () => {
    for (const kind of Object.keys(KNOWN_UNBUILDABLE)) {
      expect(
        EXECUTABLE.has(kind),
        `${kind} is in both lists — one of them is stale.`,
      ).toBe(false);
    }
  });

  it("schema is executable now", () => {
    // It was plannable-but-not-executable for the agent's whole life,
    // while wp-bridge had setPostSchema the entire time.
    expect(EXECUTABLE.has("write_schema")).toBe(true);
  });

  it("every fixable finding names a capability", () => {
    for (const [type, spec] of Object.entries(FIXABLE)) {
      expect(spec.capability, `${type} has no capability`).toBeTruthy();
      expect(spec.kind, `${type} has no kind`).toBeTruthy();
    }
  });

  it("safe fixes are only the measurable ones", () => {
    // "safe" decides whether apply_safe writes without asking. It must
    // mean "wrong by a rule", never "probably better".
    for (const [type, spec] of Object.entries(FIXABLE)) {
      if (spec.risk !== "safe") continue;
      expect(
        /missing|too_long|too long/i.test(type),
        `${type} is marked safe but isn't an absence or a measured limit — ` +
          `apply_safe would change it on a live site without asking.`,
      ).toBe(true);
    }
  });

  it("schema is a judgement call, not a safe auto-apply", () => {
    // Which schema type fits a page is an opinion, and wrong structured
    // data is a manual-action risk rather than just bad copy.
    expect(FIXABLE.missing_schema.risk).toBe("needs_review");
  });
});
