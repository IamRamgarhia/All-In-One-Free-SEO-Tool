"use server";

import { z } from "zod";
import { measureCwv, type CwvResult } from "@/lib/local-cwv";
import { measureCwvPsi } from "@/lib/local-cwv-psi";
import { saveToolRun } from "@/lib/tool-runs";

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
  | { ok: false; error: string };

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
    const result =
      parsed.data.mode === "local"
        ? await measureCwv(parsed.data.url, { device: parsed.data.device })
        : await measureCwvPsi(parsed.data.url, { device: parsed.data.device });
    if (!result.ok && result.error) return { ok: false, error: result.error };
    await saveToolRun({
      toolId: "local-cwv",
      label: `${parsed.data.url} · ${parsed.data.device} · ${parsed.data.mode}`,
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
