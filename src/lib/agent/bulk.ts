/**
 * Approving a whole class of change at once.
 *
 * WHY
 *
 * The agent proposes per page, and the caps are per run — five actions
 * by default, twenty a day. A site with two hundred pages missing a meta
 * description therefore takes ten days to fix at the default settings,
 * and every one of those days needs somebody to come back and click.
 * The decision was made on day one; the clicking is what takes ten days.
 *
 * This is the same problem the paid tools answer with "site-wide rules":
 * write it once, apply it to every page that matches. The shape here is
 * different on purpose. A rule engine invents values for pages nobody
 * has looked at; this approves values the agent has already drafted and
 * shown, so what gets applied is what was on screen.
 *
 * WHAT THIS IS NOT
 *
 * Not a way around the risk model. `needs_review` actions are excluded
 * unless the caller says so explicitly, and site-wide kinds are excluded
 * outright — "apply all" across robots.txt or redirects is the one
 * combination in this codebase that can take a site off Google, and no
 * amount of convenience is worth putting it behind a button that also
 * does ninety harmless things.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { agentActions } from "@/db/schema";
import { SITE_WIDE_KINDS } from "./planner";

/** The most one call will apply, regardless of what was asked for. */
export const BULK_CAP = 100;

export type BulkGroup = {
  kind: string;
  risk: "safe" | "needs_review";
  count: number;
  /** A few examples, so the user sees what they are agreeing to. */
  samples: { id: number; targetUrl: string | null; afterValue: string | null }[];
  /** False when this kind may never be bulk-applied. */
  bulkable: boolean;
  /** Present when it is not, so the UI can say why rather than just grey out. */
  reason?: string;
};

export type BulkRow = {
  id: number;
  kind: string;
  risk: "safe" | "needs_review";
  status: string;
  targetUrl: string | null;
  afterValue: string | null;
};

/**
 * Can a whole group of this kind be applied in one action?
 *
 * Site-wide kinds cannot, ever. There is only one robots.txt, so "apply
 * all" is meaningless for it, and the failure mode of getting it wrong
 * is a deindexed site rather than a bad title on one page.
 */
export function bulkableKind(kind: string): { ok: boolean; reason?: string } {
  if (SITE_WIDE_KINDS.has(kind)) {
    return {
      ok: false,
      reason:
        "This changes the whole site rather than a page, so it is approved one at a time on purpose.",
    };
  }
  return { ok: true };
}

/**
 * Group what is waiting for approval, so it can be judged by class.
 *
 * Split from the query so the grouping and the exclusions can be tested
 * without a database. The exclusions are the part worth testing: a
 * site-wide kind leaking into a bulkable group is the one bug here that
 * matters.
 */
export function groupForBulk(rows: readonly BulkRow[]): BulkGroup[] {
  const byKind = new Map<string, BulkRow[]>();
  for (const r of rows) {
    if (r.status !== "queued" && r.status !== "proposed") continue;
    if (!r.afterValue || !r.targetUrl) continue;
    const list = byKind.get(r.kind);
    if (list) list.push(r);
    else byKind.set(r.kind, [r]);
  }

  const out: BulkGroup[] = [];
  for (const [kind, list] of byKind) {
    const gate = bulkableKind(kind);
    out.push({
      kind,
      // A group is only "safe" if every action in it is. One
      // needs_review among ninety safe ones makes the whole group a
      // judgement call, and hiding that behind a majority vote is how
      // somebody approves a thing they would have refused.
      risk: list.every((r) => r.risk === "safe") ? "safe" : "needs_review",
      count: list.length,
      samples: list.slice(0, 3).map((r) => ({
        id: r.id,
        targetUrl: r.targetUrl,
        afterValue: r.afterValue,
      })),
      bulkable: gate.ok,
      reason: gate.reason,
    });
  }
  // Biggest first: the whole point is the group that would otherwise
  // take ten days of clicking.
  return out.sort((a, b) => b.count - a.count);
}

export type BulkResult = {
  requested: number;
  applied: number;
  failed: number;
  skipped: number;
  errors: string[];
};

/**
 * Apply every queued action of one kind for one client.
 *
 * Runs them through `approveAction`, one at a time, rather than
 * reimplementing the write. That function already handles the risk
 * gate, the revision, the verification and marking the queued row
 * superseded — a second path through the same work is how the two
 * would drift, and the one that drifted would be the one nobody tested.
 *
 * Sequential on purpose. These are writes to somebody's live website
 * through a CMS that is usually shared hosting; ninety parallel
 * requests is a way to take a site down.
 */
export async function applyBulk(opts: {
  clientId: number;
  kind: string;
  /** Required to apply a group containing judgement calls. */
  includeNeedsReview?: boolean;
  approve: (actionId: number) => Promise<{ ok: boolean; error?: string }>;
}): Promise<BulkResult> {
  const gate = bulkableKind(opts.kind);
  if (!gate.ok) {
    return {
      requested: 0,
      applied: 0,
      failed: 0,
      skipped: 0,
      errors: [gate.reason ?? "This kind cannot be applied in bulk."],
    };
  }

  const rows = await db
    .select({
      id: agentActions.id,
      risk: agentActions.risk,
      status: agentActions.status,
      afterValue: agentActions.afterValue,
      targetUrl: agentActions.targetUrl,
    })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.clientId, opts.clientId),
        eq(agentActions.kind, opts.kind),
        inArray(agentActions.status, ["queued", "proposed"]),
      ),
    )
    .limit(BULK_CAP);

  const result: BulkResult = {
    requested: rows.length,
    applied: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const r of rows) {
    if (r.risk !== "safe" && !opts.includeNeedsReview) {
      result.skipped++;
      continue;
    }
    if (!r.afterValue || !r.targetUrl) {
      result.skipped++;
      continue;
    }
    const out = await opts.approve(r.id);
    if (out.ok) result.applied++;
    else {
      result.failed++;
      // Bounded: ninety identical "site unreachable" lines tell the
      // reader nothing the first three did not.
      if (result.errors.length < 3 && out.error) result.errors.push(out.error);
    }
  }

  return result;
}
