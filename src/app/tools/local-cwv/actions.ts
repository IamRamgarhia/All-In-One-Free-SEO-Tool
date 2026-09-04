"use server";

import { z } from "zod";
import { measureCwv, type CwvResult } from "@/lib/local-cwv";
import { measureCwvPsi } from "@/lib/local-cwv-psi";
import { saveToolRun } from "@/lib/tool-runs";
import type { PsiFailure } from "@/lib/psi-error";

const inputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  device: z.enum(["mobile", "desktop"]).default("mobile"),
  // "psi" hits Google's PageSpeed Insights API — no local browser
  // memory, ~3x faster, free with 25k req/day quota. "local" runs
  // headless Chrome from this server for full control + console
  // errors. UI lets the user pick; default below is "psi".
  mode: z.enum(["psi", "local"]).default("psi"),
});

export type LocalCwvState =
  | { ok: true; result: CwvResult }
  // `failure` carries where the fix is, so the form can render a button
  // instead of a sentence naming a settings page.
  | { ok: false; error: string; failure?: PsiFailure };

export async function runLocalCwv(
  _prev: LocalCwvState | null,
  formData: FormData,
): Promise<LocalCwvState> {
  const parsed = inputSchema.safeParse({
    url: formData.get("url"),
    device: formData.get("device") || "mobile",
    mode: formData.get("mode") || "psi",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const { url, device, mode } = parsed.data;

    let result =
      mode === "local"
        ? { ...(await measureCwv(url, { device })), source: "local" as const }
        : await measureCwvPsi(url, { device });

    // Fall back to the local browser when PSI cannot answer.
    //
    // This tool is called "Local Core Web Vitals (no PSI key)" and its
    // default mode was PSI, which with no key draws on a daily allowance
    // shared by every install of this app on earth. That allowance is
    // routinely gone, so the default path failed for everyone who had
    // not added a key — and the tool has a mode right here that needs no
    // key at all. Not falling back was the bug; the 429 was the symptom.
    if (!result.ok && result.failure?.retryLocally && mode === "psi") {
      const local = await measureCwv(url, { device });
      if (local.ok) {
        result = {
          ...local,
          source: "local",
          fellBackBecause: result.failure.message,
        };
      }
    }

    if (!result.ok && result.error)
      return { ok: false, error: result.error, failure: result.failure };
    await saveToolRun({
      toolId: "local-cwv",
      // The label records how it was ACTUALLY measured, not what was
      // asked for. A run that fell back to the local browser is not the
      // same measurement as a PSI run — PSI reads real-user field data
      // where it exists — and the history would have claimed otherwise.
      label: `${url} · ${device} · ${result.source ?? mode}`,
      input: parsed.data,
      result: { ok: true, result },
    }).catch(() => undefined);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "CWV measurement failed",
    };
  }
}
