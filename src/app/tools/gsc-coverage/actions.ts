"use server";

import { inspectGscUrl, type UrlInspection } from "@/lib/google-oauth";
import { saveToolRun } from "@/lib/tool-runs";

export type CoverageState =
  | { ok: true; site: string; rows: UrlInspection[]; summary: Record<string, number> }
  | { ok: false; error: string };

const CONCURRENCY = 4;

export async function runCoverage(
  _prev: CoverageState | null,
  formData: FormData,
): Promise<CoverageState> {
  const site = String(formData.get("site") ?? "").trim();
  const urlsRaw = String(formData.get("urls") ?? "").trim();
  if (!site) return { ok: false, error: "Pick a GSC property." };
  if (!urlsRaw) return { ok: false, error: "Paste at least one URL." };

  const urls = Array.from(
    new Set(
      urlsRaw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, 60);

  // GSC URL Inspection: 2000 calls per day per property — per Google's quota.
  // We rate-limit to 4 concurrent + ~250ms between launches to be polite.
  const rows: UrlInspection[] = [];
  const queue = urls.slice();

  async function worker() {
    while (queue.length > 0) {
      const u = queue.shift();
      if (!u) return;
      try {
        const r = await inspectGscUrl({
          siteUrl: site,
          inspectionUrl: u,
        });
        rows.push(r);
      } catch (err) {
        rows.push({
          url: u,
          indexingState: null,
          verdict: null,
          crawledAs: null,
          lastCrawlTime: null,
          pageFetchState: null,
          robotsTxtState: null,
          coverageState: null,
          coverageStateReason: null,
          referringUrls: [],
          sitemap: [],
          error: (err as Error).message,
        });
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

  const summary: Record<string, number> = {};
  for (const r of rows) {
    const k = r.coverageState ?? r.verdict ?? "Unknown";
    summary[k] = (summary[k] ?? 0) + 1;
  }

  await saveToolRun({
    toolId: "gsc-coverage",
    label: `${site} · ${rows.length} URLs`,
    input: { site, urlCount: urls.length },
    result: { ok: true, site, rows, summary },
  }).catch(() => undefined);
  return { ok: true, site, rows, summary };
}
