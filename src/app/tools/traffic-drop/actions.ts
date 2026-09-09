"use server";

import { z } from "zod";
import {
  diagnoseTrafficDrop,
  type TrafficDropResult,
} from "@/lib/traffic-drop";
import { recordToolRun } from "@/lib/tool-findings";
import { trafficDropFindings } from "@/lib/tool-finding-builders";

const inputSchema = z.object({
  siteUrl: z.string().trim().min(3),
});

export type TrafficDropState =
  | { ok: true; result: TrafficDropResult }
  | { ok: false; error: string };

export async function runDiagnostic(
  _prev: TrafficDropState | null,
  formData: FormData,
): Promise<TrafficDropState> {
  const parsed = inputSchema.safeParse({
    siteUrl: formData.get("siteUrl"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const r = await diagnoseTrafficDrop({ siteUrl: parsed.data.siteUrl });
  if (!r.ok && r.error) return { ok: false, error: r.error };
  await recordToolRun({
    toolId: "traffic-drop",
    label: parsed.data.siteUrl,
    input: { siteUrl: parsed.data.siteUrl },
    result: { ok: true, result: r },
    findings: trafficDropFindings(r),
  });
  return { ok: true, result: r };
}
