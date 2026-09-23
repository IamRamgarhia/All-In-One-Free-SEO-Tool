"use server";

import { auditParity, type ParityReport } from "@/lib/migration-parity";
import { recordToolRun } from "@/lib/tool-findings";
import { parityFindings } from "@/lib/tool-finding-builders";

export type ParityState =
  | { ok: true; report: ParityReport }
  | { ok: false; error: string };

export async function runParity(
  _prev: ParityState | null,
  formData: FormData,
): Promise<ParityState> {
  const raw = String(formData.get("oldUrls") ?? "").trim();
  const newDomain = String(formData.get("newDomain") ?? "").trim() || undefined;
  if (!raw) return { ok: false, error: "Paste old URLs (one per line)." };
  const oldUrls = Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, 500);
  if (oldUrls.length === 0) return { ok: false, error: "No URLs found." };
  try {
    const report = await auditParity({ oldUrls, newDomain });
    await recordToolRun({
      toolId: "migration-parity",
      label: `${oldUrls.length} URLs${newDomain ? ` → ${newDomain}` : ""}`,
      input: { newDomain, urlCount: oldUrls.length },
      result: { ok: true, report },
      findings: parityFindings(report),
    });
    return { ok: true, report };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "Audit failed" };
  }
}
