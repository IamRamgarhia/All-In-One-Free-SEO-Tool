"use server";

import { requireSignedIn } from "@/lib/action-guard";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { auditIssues, audits } from "@/db/schema";
import { requireClientAccess } from "@/lib/auth";

type IssueStatus = "new" | "resolved" | "ignored" | "false_positive";

/** The caller must be able to edit the client the audit belongs to. */
async function requireAuditEdit(auditId: number) {
  const row = db
    .select({ clientId: audits.clientId })
    .from(audits)
    .where(eq(audits.id, auditId))
    .get();
  if (!row) return false;
  await requireClientAccess(row.clientId, { edit: true });
  return true;
}

export async function setIssueStatus(
  issueId: number,
  status: IssueStatus,
  auditId: number,
) {
  await requireSignedIn();
  if (!Number.isFinite(issueId) || issueId <= 0) return;
  const issue = db
    .select({ auditId: auditIssues.auditId })
    .from(auditIssues)
    .where(eq(auditIssues.id, issueId))
    .get();
  if (!issue || !(await requireAuditEdit(issue.auditId))) return;
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
  await requireSignedIn();
  if (!Number.isFinite(auditId) || auditId <= 0) return;
  if (!(await requireAuditEdit(auditId))) return;
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

/** What the "I fixed this — check it" button shows. Plain data. */
export type VerifyOutcome =
  | { ok: false; reason: "not_checkable" | "gone" }
  | {
      ok: true;
      resolved: number;
      stillPresent: string[];
      unverifiable: number;
      alreadyResolved: number;
      remaining: number;
      tasksClosed: number;
    };

/**
 * "I fixed this — check it for me" (ported from upstream 9702570).
 *
 * Distinct from setStatusForType above, which resolves a finding because
 * somebody clicked and verifies nothing. This re-fetches each affected
 * page and resolves a finding ONLY where the problem is gone from the
 * live HTML — the same check the agent runs on its own work, with no
 * plugin, no API key and no Google account. See lib/agent/close-loop.ts.
 */
export async function verifyIssuesFixed(
  auditId: number,
  issueIds: number[],
): Promise<VerifyOutcome> {
  await requireSignedIn();
  if (!Number.isFinite(auditId) || auditId <= 0) return { ok: false, reason: "gone" };
  if (!(await requireAuditEdit(auditId))) return { ok: false, reason: "gone" };
  // Only findings of this audit: an id from elsewhere is ignored.
  const ids = (
    await db
      .select({ id: auditIssues.id })
      .from(auditIssues)
      .where(
        and(
          eq(auditIssues.auditId, auditId),
          inArray(auditIssues.id, issueIds.filter((n) => Number.isInteger(n) && n > 0)),
        ),
      )
  ).map((r) => r.id);
  if (ids.length === 0) return { ok: false, reason: "gone" };

  const { verifyFindingsFixed } = await import("@/lib/agent/close-loop");
  const r = await verifyFindingsFixed(ids);
  revalidatePath(`/audits/${auditId}`);
  // The task list and the dashboard read from findings too.
  revalidatePath("/tasks");
  revalidatePath("/");
  if (r.result !== "checked") return { ok: false, reason: r.result };
  return {
    ok: true,
    resolved: r.pages.filter((p) => p.verdict === "resolved").length,
    stillPresent: r.pages.filter((p) => p.verdict === "still_present").map((p) => p.url),
    unverifiable: r.pages.filter(
      (p) => p.verdict !== "resolved" && p.verdict !== "still_present",
    ).length,
    alreadyResolved: r.alreadyResolved,
    remaining: r.remaining,
    tasksClosed: r.tasksClosed,
  };
}
