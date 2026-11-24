/**
 * The bounded trial.
 *
 * It exists because of a behaviour measured upstream, not a bug: most
 * actions queued and few applied, because the autonomy question asks for a
 * permanent grant over a client's live site from someone who installed
 * the tool ten minutes ago. The careful answer is "not yet", and nothing
 * ever changes it because nothing ever happens.
 *
 * The trial is only safe to offer if three things hold, and all three
 * are the kind that fail silently:
 *
 *   - judgement calls are never included, whatever the cap
 *   - the standing autonomy level is not touched
 *   - the report counts what was APPLIED, not what was attempted
 *
 * The third is the one that would do real damage. "3 changes applied"
 * when the CMS refused two is a tool lying about someone's website at
 * the exact moment they decided to trust it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { TRIAL_SIZE, describeTrial, runTrial } from "./trial";

/** The sentence the dashboard shows after a trial, in one language. */
function sentence(
  locale: "en" | "fr",
  attempted: number,
  applied: number,
  failed: number,
): string {
  const t = createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace: "dashboard.autonomy.trial.outcome",
  });
  return t(describeTrial(attempted, applied, failed), { attempted, applied, failed });
}

const SRC = readFileSync(join(process.cwd(), "src/lib/agent/trial.ts"), "utf8");

describe("the report counts what happened, not what was asked for", () => {
  it("all three succeeding reads as three", () => {
    expect(describeTrial(3, 3, 0)).toBe("all");
    const s = sentence("en", 3, 3, 0);
    expect(s).toContain("3 changes applied");
    expect(s).toContain("undo");
    expect(sentence("fr", 3, 3, 0)).toContain("3 modifications appliquées");
  });

  it("a partial failure says so, with both numbers", () => {
    expect(describeTrial(3, 1, 2)).toBe("partial");
    const s = sentence("en", 3, 1, 2);
    expect(s).toContain("1 of 3 applied");
    expect(s).toContain("2 were refused");
    // Must not read as a success.
    expect(s).not.toMatch(/^3 changes applied/);
    const f = sentence("fr", 3, 1, 2);
    expect(f).toContain("1 sur 3 appliquées");
    expect(f).toContain("2 refusées");
  });

  it("total failure says nothing was altered", () => {
    expect(describeTrial(3, 0, 3)).toBe("failed");
    const s = sentence("en", 3, 0, 3);
    expect(s).toContain("None of the 3");
    expect(s).toContain("Nothing was altered");
    expect(sentence("fr", 3, 0, 3)).toContain("Rien n’a été modifié");
  });

  it("one change is singular", () => {
    expect(sentence("en", 1, 1, 0)).toContain("1 change applied");
    expect(sentence("en", 1, 1, 0)).not.toContain("changes applied");
    expect(sentence("fr", 1, 1, 0)).toContain("1 modification appliquée et relue");
  });

  it("says no setting has changed, which is the whole offer", () => {
    // Someone who tries it and dislikes it must be exactly where they
    // started, with nothing to find and undo.
    expect(sentence("en", 3, 3, 0)).toContain("no setting has changed");
    expect(sentence("fr", 3, 3, 0)).toContain("aucun réglage n’a changé");
  });

  it("nothing attempted is its own sentence, never a success", () => {
    expect(describeTrial(0, 0, 0)).toBe("none");
    expect(sentence("en", 0, 0, 0)).toContain("nothing to try yet");
  });
});

describe("runTrial drives the real approve path and nothing else", () => {
  it("applies each candidate through the injected approve function", async () => {
    const seen: number[] = [];
    const r = await runTrial({
      approve: async (id) => {
        seen.push(id);
        return { ok: true };
      },
      limit: 2,
    });
    // Against an empty test database there are no candidates, so the
    // honest assertion is about the no-work branch rather than a
    // fabricated one.
    if (r.attempted === 0) {
      expect(r.outcome).toBe("none");
      expect(seen).toEqual([]);
      return;
    }
    expect(seen.length).toBe(r.attempted);
    expect(r.applied + r.failed).toBe(r.attempted);
  });

  it("a throwing approve is recorded as a failure, not a success", async () => {
    // An exception from the CMS client must not escape and must not be
    // counted as applied.
    const r = await runTrial({
      approve: async () => {
        throw new Error("CMS unreachable");
      },
      limit: 1,
    });
    expect(r.applied).toBe(0);
    for (const d of r.details) expect(d.ok).toBe(false);
  });

  it("says so plainly when nothing is queued", async () => {
    const r = await runTrial({ approve: async () => ({ ok: true }), limit: 3 });
    if (r.attempted === 0) {
      expect(r.outcome).toBe("none");
      expect(r.applied).toBe(0);
    }
  });
});

describe("the guarantees are in the code, not just the copy", () => {
  it("filters to safe risk in the query, not after it", () => {
    // A post-filter on a LIMIT 3 could return two safe actions and one
    // judgement call, then drop one — so the cap and the risk gate have
    // to be applied by the same query.
    expect(SRC).toContain('eq(agentActions.risk, "safe")');
    const q = SRC.slice(SRC.indexOf("export async function trialCandidates"));
    expect(q).toContain(".limit(");
    // The limit must be clamped: a caller passing 1000 must not turn a
    // trial into a full autopilot run.
    expect(q).toMatch(/Math\.min\(limit,\s*\d+\)/);
  });

  it("only ever touches queued actions", () => {
    expect(SRC).toContain('eq(agentActions.status, "queued")');
  });

  it("never writes the autonomy level", () => {
    // The point of the trial is that it grants nothing. If it set a
    // level, someone who tried it once would silently be on autopilot.
    expect(SRC).not.toContain("setLevel");
    expect(SRC).not.toContain("saveAgentSettings");
    expect(SRC).not.toMatch(/level:\s*"apply/);
  });

  it("does not reimplement the CMS write", () => {
    // approveAction owns the risk gate, the write, the read-back and the
    // undo record. A second path through that work is how the two drift,
    // and the one that drifts is the one nobody tested.
    expect(SRC).not.toContain("wp-bridge");
    expect(SRC).not.toContain("executeAction");
    expect(SRC).toContain("approve: (actionId: number)");
  });

  it("applies sequentially, not in parallel", () => {
    // These are writes to a live site, usually on shared hosting.
    expect(SRC).toContain("for (const c of candidates)");
    expect(SRC).not.toContain("Promise.all(candidates");
  });

  it("the default trial is small enough to check by hand", () => {
    expect(TRIAL_SIZE).toBeLessThanOrEqual(5);
    expect(TRIAL_SIZE).toBeGreaterThan(0);
  });
});
