"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reportArchives, reportSchedules } from "@/db/schema";
import { canSeeClient, currentUser, visibleClientIds } from "@/lib/auth";
import {
  getBatchProgress,
  startReportBatch,
  type BatchProgress,
} from "@/lib/report-batch";
import { sendReportEmail } from "@/lib/report-mailer";
import type { ReportTemplate } from "@/lib/report-generator";

export async function startBatch(input: {
  clientIds: number[];
  template: ReportTemplate;
  periodStart?: string;
  periodEnd?: string;
}): Promise<{ ok: true; batchId: number } | { ok: false; error: string }> {
  // Only generate for clients the caller can see. Otherwise a member
  // presses "generate all" and produces reports for the rest of the
  // agency's book — including PDFs full of data they were never given
  // access to, sitting in a queue they can open.
  const scope = await visibleClientIds(await currentUser());
  const ids =
    scope === null ? input.clientIds : input.clientIds.filter((id) => scope.includes(id));

  if (ids.length === 0) {
    return { ok: false, error: "None of those clients are yours to report on." };
  }

  return startReportBatch({
    clientIds: ids,
    template: input.template,
    periodStart: input.periodStart ? new Date(input.periodStart) : null,
    periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
  });
}

export async function pollBatch(batchId: number): Promise<BatchProgress | null> {
  return getBatchProgress(batchId);
}

async function guard(
  reportId: number,
): Promise<
  | { ok: true; report: typeof reportArchives.$inferSelect }
  | { ok: false; error: string }
> {
  const [report] = await db
    .select()
    .from(reportArchives)
    .where(eq(reportArchives.id, reportId))
    .limit(1);
  // Same answer for missing and forbidden — "that report belongs to
  // another client" confirms the client exists.
  if (!report) return { ok: false, error: "No such report." };
  if (!(await canSeeClient(await currentUser(), report.clientId))) {
    return { ok: false, error: "No such report." };
  }
  return { ok: true, report };
}

export async function approveReport(
  reportId: number,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(reportId);
  if (!g.ok) return g;
  if (g.report.status === "failed") {
    return {
      ok: false,
      error: "That report didn't generate, so there's nothing to approve. Re-run the batch for this client.",
    };
  }

  await db
    .update(reportArchives)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(reportArchives.id, reportId));
  revalidatePath("/reports/batch");
  return { ok: true };
}

export async function rejectReport(
  reportId: number,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(reportId);
  if (!g.ok) return g;
  await db
    .update(reportArchives)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(eq(reportArchives.id, reportId));
  revalidatePath("/reports/batch");
  return { ok: true };
}

/**
 * Send an approved report to the client.
 *
 * Refuses anything not explicitly approved. That refusal is the whole
 * safety property of this workflow — without it, "send all" would
 * deliver drafts nobody read, which is the failure the review step
 * exists to prevent.
 */
export async function sendReport(
  reportId: number,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(reportId);
  if (!g.ok) return g;

  if (g.report.status !== "approved") {
    return {
      ok: false,
      error:
        g.report.status === "sent"
          ? "That one has already gone out."
          : "Approve it first — the review step is there so nothing goes to a client unread.",
    };
  }
  if (!g.report.pdfBase64) {
    return { ok: false, error: "That report has no PDF attached." };
  }

  // Recipients come from the client's existing report schedule. There is
  // no separate "who gets the monthly report" field, and inventing one
  // would give the same client two answers that could disagree.
  const [schedule] = await db
    .select({ recipients: reportSchedules.recipients })
    .from(reportSchedules)
    .where(eq(reportSchedules.clientId, g.report.clientId))
    .limit(1);

  const recipients = (schedule?.recipients ?? []).filter(Boolean);
  if (recipients.length === 0) {
    return {
      ok: false,
      error:
        "No one to send it to. Add recipients on this client's report schedule, then try again. You can also download the PDF and send it yourself.",
    };
  }

  const result = await sendReportEmail({
    clientId: g.report.clientId,
    template: (g.report.template ?? "detailed") as ReportTemplate,
    recipients,
    // Send the approved bytes, not a fresh render — see sendReportEmail.
    pdf: Buffer.from(g.report.pdfBase64, "base64"),
  }).catch((err) => ({ ok: false as const, error: (err as Error).message }));

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "Sending failed. Check Settings → Email delivery.",
    };
  }

  await db
    .update(reportArchives)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(reportArchives.id, reportId));
  revalidatePath("/reports/batch");
  return { ok: true };
}
