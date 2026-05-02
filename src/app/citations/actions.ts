"use server";

import { setSubmissionStatus as base } from "@/app/link-building/actions";

type Status = "pending" | "submitted" | "live" | "rejected" | "lost";

/** Form-friendly wrapper that discards FormData. */
export async function setStatusForm(
  submissionId: number,
  status: Status,
): Promise<void> {
  await base(submissionId, status);
}
