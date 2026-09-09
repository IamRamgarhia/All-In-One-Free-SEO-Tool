"use server";

import { z } from "zod";
import { auditEeat, type EeatResult } from "@/lib/eeat-audit";
import { recordToolRun } from "@/lib/tool-findings";
import { eeatFindings } from "@/lib/tool-finding-builders";

const inputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
});

export type EeatState =
  | { ok: true; result: EeatResult }
  | { ok: false; error: string };

export async function runEeatAudit(
  _prev: EeatState | null,
  formData: FormData,
): Promise<EeatState> {
  const parsed = inputSchema.safeParse({ url: formData.get("url") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid URL" };
  }
  try {
    const result = await auditEeat({ url: parsed.data.url });
    if (result.error) return { ok: false, error: result.error };
    await recordToolRun({
      toolId: "eeat-audit",
      label: `${parsed.data.url} · ${result.score?.total ?? "?"}/100`,
      input: { url: parsed.data.url },
      result: { ok: true, result },
      findings: eeatFindings(result),
    });
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "E-E-A-T audit failed",
    };
  }
}
