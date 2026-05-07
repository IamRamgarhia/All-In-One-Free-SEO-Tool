"use server";

import {
  generateCompositeBrief,
  type CompositeBrief,
} from "@/lib/brief-composite";

export type BriefState =
  | { ok: true; result: CompositeBrief }
  | { ok: false; error: string };

export async function runBrief(
  _prev: BriefState | null,
  formData: FormData,
): Promise<BriefState> {
  const query = String(formData.get("query") ?? "").trim();
  const country = String(formData.get("country") ?? "US").trim();
  const clientDomain = String(formData.get("clientDomain") ?? "").trim() || undefined;
  if (!query) return { ok: false, error: "Query required." };
  const r = await generateCompositeBrief({ query, country, clientDomain });
  if (!r.ok && r.error) return { ok: false, error: r.error };
  return { ok: true, result: r };
}
