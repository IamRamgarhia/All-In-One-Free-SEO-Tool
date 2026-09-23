"use server";

import { auditFreshness, type FreshnessAudit } from "@/lib/freshness-check";
import { recordToolRun } from "@/lib/tool-findings";
import { freshnessFindings } from "@/lib/tool-finding-builders";

export async function runFreshnessAudit(
  url: string,
  sitemapUrl?: string,
): Promise<FreshnessAudit> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, url: "", error: "Enter a URL first." };
  const result = await auditFreshness(trimmed, {
    sitemapUrl: sitemapUrl?.trim() || undefined,
  });
  await recordToolRun({
    toolId: "freshness",
    label:
      result.ok
        ? `${result.url} · ${result.verdict} · score ${result.score}`
        : `${trimmed} · error`,
    input: { url: trimmed, sitemapUrl: sitemapUrl ?? null },
    result,
    findings: result.ok ? freshnessFindings(result) : [],
  });
  return result;
}
