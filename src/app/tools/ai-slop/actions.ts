"use server";

import { scoreContent, type SlopReport } from "@/lib/ai-slop-patterns";
import { saveToolRun } from "@/lib/tool-runs";

export type AiSlopState =
  | null
  | { ok: true; report: SlopReport; sourceLen: number }
  | { ok: false; error: string };

export async function checkSlop(
  _prev: AiSlopState,
  formData: FormData,
): Promise<AiSlopState> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: "Paste some content to score." };
  if (text.length > 100_000) {
    return { ok: false, error: "Content too long — keep it under 100,000 characters." };
  }

  const report = scoreContent(text);

  await saveToolRun({
    toolId: "ai-slop",
    label: `${report.score}/100 · ${report.verdictLabel}`,
    input: { sourceLen: text.length },
    result: { ok: true, report },
  }).catch(() => undefined);

  return { ok: true, report, sourceLen: text.length };
}
