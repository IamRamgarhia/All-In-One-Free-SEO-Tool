"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { auditIssues } from "@/db/schema";

type IssueStatus = "new" | "resolved" | "ignored" | "false_positive";

export async function setIssueStatus(
  issueId: number,
  status: IssueStatus,
  auditId: number,
) {
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
