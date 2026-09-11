"use server";

/**
 * @ai-optional
 *
 * Every number here comes from Search Console and is computed without a
 * model. The only thing AI adds is the prose `diagnosis` sentence, and
 * the page is complete and correct with that field empty — verified
 * against a live property with no provider configured.
 *
 * See tool-capabilities.derive.ts — this marker is what stops the badge
 * saying the whole page is unavailable when it is not.
 */

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
