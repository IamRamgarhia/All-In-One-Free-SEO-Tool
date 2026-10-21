import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { dataDir } from "@/lib/data-dir";

const SUBDIR = "audit-previews";

/** Relative path stored on the audit row (under SEO_DATA_DIR). */
export function auditPreviewRelativePath(auditId: number): string {
  return path.join(SUBDIR, `${auditId}.png`);
}

export function auditPreviewAbsolutePath(auditId: number): string {
  return path.join(dataDir(), auditPreviewRelativePath(auditId));
}

export async function saveAuditPreviewPng(
  auditId: number,
  png: Buffer,
): Promise<string> {
  const abs = auditPreviewAbsolutePath(auditId);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, png);
  return auditPreviewRelativePath(auditId);
}
