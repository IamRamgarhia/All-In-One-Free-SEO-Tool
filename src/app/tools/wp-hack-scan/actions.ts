"use server";

import {
  scanWordPressHack,
  type HackScanReport,
} from "@/lib/wp-hack-scanner";
import { recordToolRun } from "@/lib/tool-findings";
import { wpHackFindings } from "@/lib/tool-finding-builders";

export type WpHackState =
  | { ok: true; report: HackScanReport }
  | { ok: false; error: string }
  | null;

export async function runWpHackScan(
  _prev: WpHackState,
  formData: FormData,
): Promise<WpHackState> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { ok: false, error: "Enter your site URL." };
  try {
    const report = await scanWordPressHack(url);
    if (!report.homepageReachable) {
      return { ok: false, error: `Couldn't reach ${url}.` };
    }
    await recordToolRun({
      toolId: "wp-hack-scan",
      label: `${report.domain} · ${report.riskLevel} (${report.iocs.length} IOCs)`,
      input: { url },
      result: { ok: true, report },
      findings: wpHackFindings(report),
  });
    return { ok: true, report };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Scan failed.",
    };
  }
}
