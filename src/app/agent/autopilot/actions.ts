"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { agentActions } from "@/db/schema";
import {
  canManageSettings,
  canSeeClient,
  currentUser,
  visibleClientIds,
} from "@/lib/auth";
import {
  getAgentSettings,
  setAgentSettings,
  type AgentSettings,
  type AutonomyLevel,
} from "@/lib/agent/autonomy";
import { revertAction } from "@/lib/agent/executor";
import { runAgentForAllClients, runAgentForClient } from "@/lib/agent/run";

/**
 * Every mutating action here re-checks that the caller may see the
 * client the action belongs to.
 *
 * The page already filters what it renders, but these are server
 * actions — public endpoints with a nicer calling convention. Without
 * this a member could approve or undo a change on any of the agency's
 * clients by guessing an id, and the change would land on a live website
 * they were never given access to.
 */
async function assertMayTouch(
  actionId: number,
): Promise<{ ok: true; action: typeof agentActions.$inferSelect } | { ok: false; error: string }> {
  const [action] = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.id, actionId))
    .limit(1);
  // Same 404-shaped answer whether it doesn't exist or isn't theirs —
  // "that change belongs to another client" confirms the client exists.
  if (!action) return { ok: false, error: "No such change." };
  if (!(await canSeeClient(await currentUser(), action.clientId))) {
    return { ok: false, error: "No such change." };
  }
  return { ok: true, action };
}

export async function saveAgentSettings(
  patch: Partial<AgentSettings>,
): Promise<AgentSettings> {
  // Autonomy is a workspace-wide setting that decides whether anything
  // writes to live sites, so it is owner-or-solo territory.
  const me = await currentUser();
  if (me && !canManageSettings(me.role)) {
    throw new Error("Only the owner can change what the agent may do.");
  }
  const next = await setAgentSettings(patch);
  revalidatePath("/agent/autopilot");
  return next;
}

export async function setLevel(level: AutonomyLevel): Promise<AgentSettings> {
  return saveAgentSettings({ level });
}

export type RunNowResult = {
  ok: boolean;
  summary: string;
  applied: number;
  queued: number;
  failed: number;
  tasksCreated: number;
};

export async function runNow(clientId?: number): Promise<RunNowResult> {
  const settings = await getAgentSettings();
  if (settings.level === "off") {
    return {
      ok: false,
      summary: "The agent is turned off. Pick a level above to enable it.",
      applied: 0,
      queued: 0,
      failed: 0,
      tasksCreated: 0,
    };
  }

  if (clientId && !(await canSeeClient(await currentUser(), clientId))) {
    return {
      ok: false,
      summary: "No such client.",
      applied: 0,
      queued: 0,
      failed: 0,
      tasksCreated: 0,
    };
  }

  // "Run now" with no client means every client the caller can see, not
  // every client in the workspace — a member pressing this shouldn't set
  // the agent loose on the rest of the agency's book.
  const scope = await visibleClientIds(await currentUser());
  const results = clientId
    ? [await runAgentForClient({ clientId, trigger: "manual", settings })]
    : scope === null
      ? await runAgentForAllClients("manual")
      : await Promise.all(
          // Sequential would be kinder to a small VPS, but a member has
          // at most a handful of clients and this is a button they are
          // watching.
          scope.map((id) =>
            runAgentForClient({ clientId: id, trigger: "manual", settings }),
          ),
        );

  revalidatePath("/agent/autopilot");
  revalidatePath("/tasks");

  const total = results.reduce(
    (acc, r) => ({
      applied: acc.applied + r.applied,
      queued: acc.queued + r.queued,
      failed: acc.failed + r.failed,
      tasksCreated: acc.tasksCreated + r.tasksCreated,
    }),
    { applied: 0, queued: 0, failed: 0, tasksCreated: 0 },
  );

  return {
    ok: true,
    summary:
      results.length === 1
        ? results[0].summary
        : results.map((r) => r.summary).join(" "),
    ...total,
  };
}

/**
 * Approve a queued change and write it to the site.
 *
 * The queued row already holds the drafted replacement, so approving
 * doesn't re-run the model — the user is approving the exact text they
 * were shown, not a fresh generation that might differ from it.
 */
export async function approveAction(
  actionId: number,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await assertMayTouch(actionId);
  if (!guard.ok) return guard;
  const action = guard.action;
  if (action.status !== "queued" && action.status !== "proposed") {
    return { ok: false, error: "That change isn't waiting for approval." };
  }
  if (!action.afterValue || !action.targetUrl) {
    return { ok: false, error: "That change has nothing to apply." };
  }

  const { executeAction } = await import("@/lib/agent/executor");
  const outcome = await executeAction({
    runId: action.runId,
    clientId: action.clientId,
    action: {
      kind: action.kind as "write_title" | "write_meta_description",
      targetUrl: action.targetUrl,
      reason: action.reason ?? "",
      risk: action.risk,
      weight: 0,
      currentValue: action.beforeValue,
    },
    newValue: action.afterValue,
    apply: true,
    siteName: "",
  });

  // The queued row has been superseded by the applied one. Marking it
  // rather than deleting keeps the trail of "this was proposed, then
  // approved by a human at this time".
  await db
    .update(agentActions)
    .set({ status: "skipped", error: "Superseded — approved and applied." })
    .where(eq(agentActions.id, actionId));

  revalidatePath("/agent/autopilot");
  return outcome.status === "failed"
    ? { ok: false, error: outcome.error }
    : { ok: true };
}

export async function rejectAction(
  actionId: number,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await assertMayTouch(actionId);
  if (!guard.ok) return guard;

  await db
    .update(agentActions)
    .set({ status: "skipped", error: "Rejected by you." })
    .where(eq(agentActions.id, actionId));
  revalidatePath("/agent/autopilot");
  return { ok: true };
}

export async function undoAction(
  actionId: number,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await assertMayTouch(actionId);
  if (!guard.ok) return guard;

  const result = await revertAction(actionId);
  revalidatePath("/agent/autopilot");
  return result;
}

/**
 * Undo every change from one run. The panic button.
 *
 * Newest first, so a page edited twice in the same run ends up back at
 * its original value rather than at the intermediate one.
 */
export async function undoRun(
  runId: number,
): Promise<{ ok: boolean; undone: number; failed: number; error?: string }> {
  const rows = await db
    .select({ id: agentActions.id, clientId: agentActions.clientId })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.runId, runId),
        inArray(agentActions.status, ["applied", "verified"]),
      ),
    )
    .orderBy(desc(agentActions.id));

  if (rows.length === 0) return { ok: true, undone: 0, failed: 0 };

  const me = await currentUser();
  if (!(await canSeeClient(me, rows[0].clientId))) {
    return { ok: false, undone: 0, failed: 0, error: "No such run." };
  }

  let undone = 0;
  let failed = 0;
  for (const r of rows) {
    const res = await revertAction(r.id);
    if (res.ok) undone++;
    else failed++;
  }

  revalidatePath("/agent/autopilot");
  return { ok: failed === 0, undone, failed };
}
