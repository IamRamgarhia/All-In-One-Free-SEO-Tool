"use server";

import { detectFacetTraps, type FacetTrapReport } from "@/lib/facet-trap";
import { recordToolRun } from "@/lib/tool-findings";
import { facetTrapFindings } from "@/lib/tool-finding-builders";

export type FacetTrapState =
  | { ok: true; report: FacetTrapReport }
  | { ok: false; error: string }
  | null;

export async function runFacetTrap(
  _prev: FacetTrapState,
  formData: FormData,
): Promise<FacetTrapState> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { ok: false, error: "URL required." };
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  try {
    const report = await detectFacetTraps(parsed.toString(), 60);
    await recordToolRun({
      toolId: "facet-trap",
      label: `${report.domain} · ${report.overall} risk · ${report.facetUrlCount} facet URLs`,
      input: { url: parsed.toString() },
      result: { ok: true, report },
      findings: facetTrapFindings(report),
  });
    return { ok: true, report };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Scan failed.",
    };
  }
}
