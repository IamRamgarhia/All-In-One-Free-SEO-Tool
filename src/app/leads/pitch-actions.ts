"use server";

import { requireSignedIn } from "@/lib/action-guard";
import { actionTx } from "@/lib/action-tx";
import { runAudit } from "@/lib/audit";
import { isDirectory } from "@/lib/prospect-site";
import { fetchSerpViaApi, serpApiConfig } from "@/lib/serp-api";

export type CompetitorRow = { url: string; host: string; score: number | null; critical: number; high: number };

export type CompareResult =
  | { ok: true; query: string; competitors: CompetitorRow[] }
  | { ok: false; error: string };

/**
 * The prospect next to the first three sites Google shows for a search
 * their customers make ("boulangerie orly"), each graded with the same
 * express audit. Directories and the prospect's own site are skipped.
 * Measured, not claimed: a site that cannot be reached says so.
 */
export async function compareCompetitors(input: { query: string; prospectUrl: string }): Promise<CompareResult> {
  await requireSignedIn();
  const tx = await actionTx("leads.pitch");
  const query = input.query.trim().slice(0, 120);
  if (query.length < 3) return { ok: false, error: tx("errorQuery") };
  const config = await serpApiConfig();
  if (!config) return { ok: false, error: tx("errorNoApi") };
  const serp = await fetchSerpViaApi(config, { query, country: "FR", language: "fr", depth: 20 });
  if (!serp.ok) return { ok: false, error: serp.error };

  let own = "";
  try {
    own = new URL(input.prospectUrl).hostname.replace(/^www\./, "");
  } catch {
    // no site of their own to skip
  }
  const hosts: { url: string; host: string }[] = [];
  for (const url of serp.urls) {
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }
    if (!host || host === own || isDirectory(host) || hosts.some((h) => h.host === host)) continue;
    hosts.push({ url: `https://${new URL(url).hostname}/`, host });
    if (hosts.length === 3) break;
  }

  const competitors = await Promise.all(
    hosts.map(async (h): Promise<CompetitorRow> => {
      try {
        const r = await runAudit(h.url, { maxPages: 1, maxDepth: 0 });
        if (r.pagesCrawled === 0) return { ...h, score: null, critical: 0, high: 0 };
        return {
          ...h,
          score: r.score,
          critical: r.findings.filter((f) => f.severity === "critical").length,
          high: r.findings.filter((f) => f.severity === "high").length,
        };
      } catch {
        return { ...h, score: null, critical: 0, high: 0 };
      }
    }),
  );
  return { ok: true, query, competitors };
}
