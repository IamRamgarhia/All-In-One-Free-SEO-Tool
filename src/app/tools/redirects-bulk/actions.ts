"use server";

import { traceMany, type RedirectChain } from "@/lib/redirect-tracer";
import { saveToolRun } from "@/lib/tool-runs";

export type BulkState =
  | { ok: true; chains: RedirectChain[] }
  | { ok: false; error: string };

export async function runBulk(
  _prev: BulkState | null,
  formData: FormData,
): Promise<BulkState> {
  const raw = String(formData.get("urls") ?? "").trim();
  if (!raw) return { ok: false, error: "Paste at least one URL." };

  const urls = Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => /^https?:\/\/|^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)),
    ),
  ).slice(0, 100);
  if (urls.length === 0) return { ok: false, error: "No valid URLs found." };

  try {
    const chains = await traceMany(urls);
    await saveToolRun({
      toolId: "redirects-bulk",
      label: `${urls.length} URLs traced`,
      input: { urlCount: urls.length },
      result: { ok: true, chains },
    }).catch(() => undefined);
    return { ok: true, chains };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "Trace failed" };
  }
}
