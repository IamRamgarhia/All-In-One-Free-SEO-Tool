"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { resourceSubmissions } from "@/db/schema";

type Status = "pending" | "submitted" | "live" | "rejected" | "lost";

export async function trackResource(
  resourceId: number,
  clientId: number,
): Promise<void> {
  if (
    !Number.isFinite(resourceId) ||
    !Number.isFinite(clientId) ||
    resourceId <= 0 ||
    clientId <= 0
  )
    return;

  // Skip if already tracked
  const existing = await db
    .select({ id: resourceSubmissions.id })
    .from(resourceSubmissions)
    .where(
      and(
        eq(resourceSubmissions.resourceId, resourceId),
        eq(resourceSubmissions.clientId, clientId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    revalidatePath("/link-building");
    return;
  }

  await db.insert(resourceSubmissions).values({
    resourceId,
    clientId,
    status: "pending",
  });
  revalidatePath("/link-building");
}

export async function setSubmissionStatus(
  submissionId: number,
  status: Status,
  submittedUrl?: string,
) {
  if (!Number.isFinite(submissionId) || submissionId <= 0) return;
  const updates: {
    status: Status;
    updatedAt: Date;
    submittedAt?: Date;
    submittedUrl?: string | null;
  } = { status, updatedAt: new Date() };
  if (status === "submitted" || status === "live") {
    updates.submittedAt = new Date();
  }
  if (submittedUrl !== undefined) updates.submittedUrl = submittedUrl || null;

  await db
    .update(resourceSubmissions)
    .set(updates)
    .where(eq(resourceSubmissions.id, submissionId));
  revalidatePath("/link-building");
}

export async function deleteSubmission(submissionId: number) {
  if (!Number.isFinite(submissionId) || submissionId <= 0) return;
  await db
    .delete(resourceSubmissions)
    .where(eq(resourceSubmissions.id, submissionId));
  revalidatePath("/link-building");
}

export async function setSubmittedUrl(
  submissionId: number,
  formData: FormData,
) {
  if (!Number.isFinite(submissionId) || submissionId <= 0) return;
  const url = String(formData.get("submittedUrl") ?? "").trim();
  await db
    .update(resourceSubmissions)
    .set({
      submittedUrl: url || null,
      status: url ? "live" : "submitted",
      updatedAt: new Date(),
    })
    .where(eq(resourceSubmissions.id, submissionId));
  revalidatePath("/link-building");
}
