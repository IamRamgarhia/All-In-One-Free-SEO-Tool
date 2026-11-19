"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { auditIssues } from "@/db/schema";
import { guardAction } from "@/lib/action-guard";

type IssueStatus = "new" | "resolved" | "ignored" | "false_positive";

export async function setIssueStatus(
  issueId: number,
  status: IssueStatus,
  auditId: number,
) {
  await guardAction("edit");
  if (!Number.isFinite(issueId) || issueId <= 0) return;
  await db
    .update(auditIssues)
    .set({ status, updatedAt: new Date() })
    .where(eq(auditIssues.id, issueId));
  revalidatePath(`/audits/${auditId}`);
}

export async function setStatusForType(
  auditId: number,
  type: string,
  status: IssueStatus,
) {
  await guardAction("edit");
  if (!Number.isFinite(auditId) || auditId <= 0) return;
  const rows = await db
    .select({ id: auditIssues.id })
    .from(auditIssues)
    .where(and(eq(auditIssues.auditId, auditId), eq(auditIssues.type, type)));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  await db
    .update(auditIssues)
    .set({ status, updatedAt: new Date() })
    .where(inArray(auditIssues.id, ids));
  revalidatePath(`/audits/${auditId}`);
}

/**
 * "I fixed this — check it for me."
 *
 * Distinct from setIssueStatus above, which resolves a finding because
 * somebody clicked. That path verifies nothing: on this install 155
 * findings were resolved that way, so the health score, the task list
 * and the client report all rested on an unchecked claim.
 *
 * This one re-fetches the live page and resolves ONLY if the problem is
 * genuinely gone — the same check the agent runs on its own work, made
 * available to the large majority of users who have no CMS connection
 * for the agent to write through.
 *
 * It needs no plugin, no API key and no Google account, which is the
 * point: it is the only version of "finish the job" that every user of
 * this product can reach.
 */
export async function verifyIssueFixed(
  issueId: number,
  auditId: number,
): Promise<{ result: string; note: string }> {
  await guardAction("edit");
  if (!Number.isFinite(issueId) || issueId <= 0) {
    return { result: "gone", note: "No such finding." };
  }
  const { verifyFindingFixed } = await import("@/lib/agent/close-loop");
  const r = await verifyFindingFixed(issueId);
  revalidatePath(`/audits/${auditId}`);
  // The task list and the dashboard both read from findings, so a
  // confirmed fix changes them too.
  revalidatePath("/tasks");
  revalidatePath("/");
  return { result: r.result, note: r.note };
}
