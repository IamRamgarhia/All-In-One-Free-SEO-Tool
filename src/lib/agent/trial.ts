/**
 * "Let me do three of these and show you what happened."
 *
 * THE MEASURED PROBLEM: 60 agent runs on this install, 59 actions
 * planned, 3 applied, 42 queued — the oldest waiting 68 days. The
 * autonomy level had never been chosen, so it sat on the cautious
 * `suggest` default and the approval queue grew on its own.
 *
 * That is not a bug in the agent. It is the question being wrong. The
 * prompt asks someone to decide, up front and permanently, how much
 * authority a tool they have just installed should have over a client's
 * live website — a site they are accountable for to somebody else. The
 * careful answer is "not yet", the careful answer never expires, and
 * nothing ever changes their mind because nothing ever happens.
 *
 * So this offers a different deal: a bounded trial that changes no
 * standing setting. Apply three safe changes, now, and look at them.
 * Then decide. Three is small enough to check by hand and large enough
 * to be evidence.
 *
 * The properties that make it safe to offer, each tested:
 *
 *   - `safe` risk only. Judgement calls are never included, whatever
 *     the cap is set to. A "trial" that rewrote someone's homepage copy
 *     would destroy exactly the trust it exists to build.
 *   - It does NOT change `level`. Someone who tries it and dislikes it
 *     is back where they started with no setting to find and undo.
 *   - Hard cap, enforced against what actually got applied rather than
 *     what was requested.
 *   - Every change is an ordinary agent action: logged, with its
 *     previous value, undoable one at a time or as a batch, and picked
 *     up by the loop-closing step like any other.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { agentActions } from "@/db/schema";
import { TRIAL_SIZE, type TrialResult } from "./trial-shared";

// TRIAL_SIZE and TrialResult live in trial-shared.ts so the client
// component that renders the offer can read them without pulling this
// module's database import into the browser bundle. Re-exported here so
// server callers have one import.
export { TRIAL_SIZE, type TrialResult } from "./trial-shared";

export type TrialCandidate = {
  id: number;
  clientId: number;
  kind: string;
  targetUrl: string | null;
  beforeValue: string | null;
  afterValue: string | null;
};

/**
 * The oldest queued SAFE actions, which is what a trial should spend.
 *
 * Oldest first on purpose: those are the ones that have been waiting,
 * and clearing the front of a 68-day-old queue is more use than picking
 * whatever is newest.
 *
 * `risk = "safe"` is a database filter, not a post-filter, so a cap of
 * 3 cannot accidentally return 2 safe and 1 judgement call.
 */
export async function trialCandidates(
  limit: number = TRIAL_SIZE,
  clientId?: number,
): Promise<TrialCandidate[]> {
  const where = clientId
    ? and(
        eq(agentActions.status, "queued"),
        eq(agentActions.risk, "safe"),
        eq(agentActions.clientId, clientId),
      )
    : and(eq(agentActions.status, "queued"), eq(agentActions.risk, "safe"));

  return db
    .select({
      id: agentActions.id,
      clientId: agentActions.clientId,
      kind: agentActions.kind,
      targetUrl: agentActions.targetUrl,
      beforeValue: agentActions.beforeValue,
      afterValue: agentActions.afterValue,
    })
    .from(agentActions)
    .where(where)
    .orderBy(asc(agentActions.createdAt))
    .limit(Math.max(0, Math.min(limit, 10)));
}

/**
 * Run the trial.
 *
 * `approve` is injected — the caller passes the real `approveAction`
 * server action, which already owns the risk gate, the CMS write, the
 * read-back verification and the undo record. Reimplementing any of
 * that here would be a second path through the same work, and the one
 * that drifted would be the one nobody tested.
 *
 * Sequential, like applyBulk, and for the same reason: these are writes
 * to somebody's live website, usually on shared hosting.
 */
export async function runTrial(opts: {
  approve: (actionId: number) => Promise<{ ok: boolean; error?: string }>;
  limit?: number;
  clientId?: number;
}): Promise<TrialResult> {
  const candidates = await trialCandidates(opts.limit ?? TRIAL_SIZE, opts.clientId);

  if (candidates.length === 0) {
    return {
      attempted: 0,
      applied: 0,
      failed: 0,
      details: [],
      summary:
        "Nothing is queued that can be applied without a judgement call, " +
        "so there is nothing to try yet.",
    };
  }

  const details: TrialResult["details"] = [];
  let applied = 0;
  let failed = 0;

  for (const c of candidates) {
    try {
      const r = await opts.approve(c.id);
      details.push({ id: c.id, ok: r.ok, error: r.error });
      if (r.ok) applied++;
      else failed++;
    } catch (err) {
      details.push({ id: c.id, ok: false, error: (err as Error).message });
      failed++;
    }
  }

  return {
    attempted: candidates.length,
    applied,
    failed,
    details,
    summary: describeTrial(candidates.length, applied, failed),
  };
}

/**
 * The sentence shown afterwards.
 *
 * Counted from what was applied, not from what was requested — a trial
 * that reports "3 changes made" when the CMS refused two is the one
 * thing that would make this worse than not offering it.
 */
export function describeTrial(
  attempted: number,
  applied: number,
  failed: number,
): string {
  if (applied === 0 && failed > 0) {
    return (
      `None of the ${attempted} change${attempted === 1 ? "" : "s"} went ` +
      `through — the site refused them. Nothing was altered, and the ` +
      `reason is on each one below.`
    );
  }
  if (failed === 0) {
    return (
      `${applied} change${applied === 1 ? "" : "s"} applied and read back ` +
      `from the site. Each one is listed with what it was before, and you ` +
      `can undo any of them in one click. Nothing else was touched, and no ` +
      `setting has changed.`
    );
  }
  return (
    `${applied} of ${attempted} applied; ${failed} ${failed === 1 ? "was" : "were"} ` +
    `refused by the site. The ones that worked are listed with their ` +
    `previous values and can be undone individually.`
  );
}

/**
 * How many safe changes are waiting, and how long the oldest has waited.
 *
 * Used to word the offer. "14 changes have been waiting 68 days" is a
 * reason to press a button; "review pending actions" is not.
 */
export async function trialOffer(): Promise<{
  waiting: number;
  oldestDays: number | null;
} | null> {
  const rows = await db
    .select({ createdAt: agentActions.createdAt })
    .from(agentActions)
    .where(
      and(
        inArray(agentActions.status, ["queued"]),
        eq(agentActions.risk, "safe"),
      ),
    );

  if (rows.length === 0) return null;

  const oldest = rows
    .map((r) => (r.createdAt instanceof Date ? r.createdAt.getTime() : NaN))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)[0];

  return {
    waiting: rows.length,
    oldestDays: Number.isFinite(oldest)
      ? Math.floor((Date.now() - oldest) / (24 * 60 * 60 * 1000))
      : null,
  };
}
