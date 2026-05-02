"use server";

import { auditImages, type ImageAuditResult } from "@/lib/image-audit";

export async function runImageAudit(
  url: string,
): Promise<ImageAuditResult> {
  return auditImages(url);
}
