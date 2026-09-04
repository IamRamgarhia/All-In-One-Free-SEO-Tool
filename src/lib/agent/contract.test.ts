import { describe, expect, it, vi } from "vitest";
import { FIXABLE } from "./planner";

vi.mock("../ai-call", () => ({ callAIResult: vi.fn() }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("../wp-bridge", () => ({
  findPostIdByUrl: vi.fn(),
  getClientWpCreds: vi.fn(),
  getPostImages: vi.fn(),
  getPostSeo: vi.fn(),
  setAttachmentAlt: vi.fn(),
  setPostSchema: vi.fn(),
  setPostSeo: vi.fn(),
}));

const { requiresDraft } = await import("./executor");

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
  // Not driven by an audit finding — an orphan page is invisible to any
  // per-page check, because the problem is the absence of a link on a
  // different page. planInternalLinks in planner.ts produces these.
  "write_internal_links",
  // Plugin 0.5.0 wired both into POST /post/{id}/seo, and
  // GET returns them so a write can be verified and undone. Before that
  // the handler read neither and answered ok to a write that changed
  // nothing — which is what this whole contract exists to catch.
  "write_canonical",
  "write_robots_meta",
  // Site-wide rather than per-page, so it has its own branch in
  // executeAction instead of going through writeField — the target is
  // the site, and there is no post id to resolve.
  "write_robots_txt",
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
    //
    // The pattern matches an absence (`missing_…`) or a measured length
    // (`long_…` / `short_…`). It used to look for `too_long`, which was
    // the agent's own name for a finding the crawler calls `long_title`
    // — the drift that meant the agent could never plan those fixes at
    // all. See audit-finding-types.ts.
    for (const [type, spec] of Object.entries(FIXABLE)) {
      if (spec.risk !== "safe") continue;
      expect(
        /^missing_|^long_|^short_/i.test(type),
        `${type} is marked safe but isn't an absence or a measured limit — ` +
          `apply_safe would change it on a live site without asking.`,
      ).toBe(true);
    }
  });

  it("every executable kind needs a value drafted for it", () => {
    // The bug this exists to prevent, which shipped and ran:
    //
    // run.ts decided what needed drafting from its own inline list of
    // two kinds. Alt text and schema weren't on it, so they went to the
    // executor with an empty string. Writing "" as alt text succeeded,
    // the read-back matched — nothing had changed — and the action
    // recorded itself as VERIFIED. Every image the agent "fixed" still
    // had no alt text, and the finding was closed.
    //
    // Every kind the agent can apply means "put content here". None can
    // be executed with nothing, so all of them must require a draft.
    for (const kind of EXECUTABLE) {
      expect(
        requiresDraft(kind),
        `${kind} can be executed but nothing drafts a value for it. It would ` +
          `be written as an empty string, verify cleanly against the unchanged ` +
          `field, and be reported to the user as fixed.`,
      ).toBe(true);
    }
  });

  it("internal links are executable and need a value drafted", () => {
    // The pair that has to stay in step. A kind the planner can emit
    // but the executor can't perform produces a run that looks busy and
    // changes nothing; a kind that skips drafting gets executed with an
    // empty string, which is how alt text and schema came to report
    // themselves as fixed while writing nothing.
    expect(EXECUTABLE.has("write_internal_links")).toBe(true);
    expect(requiresDraft("write_internal_links")).toBe(true);
  });

  it("schema is a judgement call, not a safe auto-apply", () => {
    // Which schema type fits a page is an opinion, and wrong structured
    // data is a manual-action risk rather than just bad copy.
    expect(FIXABLE.missing_schema.risk).toBe("needs_review");
  });
});
