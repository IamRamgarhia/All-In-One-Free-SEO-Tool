"use server";

import { fetchSiteMetadata, type SiteMetadata } from "@/lib/site-metadata";
import { detectTechStack } from "@/lib/tech-detect";
import { runAudit, type AuditFinding } from "@/lib/audit";
import { scanCwv, type CwvScanResult } from "@/lib/pagespeed";

export type CompareSnapshot = {
  url: string;
  reachable: boolean;
  metadata: SiteMetadata | null;
  techStack: string[] | null;
  audit: {
    score: number;
    pagesCrawled: number;
    findings: AuditFinding[];
    error?: string;
  } | null;
  cwv: CwvScanResult | null;
  error?: string;
};

export type CompareResult =
  | { ok: true; a: CompareSnapshot; b: CompareSnapshot }
  | { ok: false; error: string };

function normalize(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function snapshot(rawUrl: string): Promise<CompareSnapshot> {
  const url = normalize(rawUrl.trim());
  const out: CompareSnapshot = {
    url,
    reachable: false,
    metadata: null,
    techStack: null,
    audit: null,
    cwv: null,
  };

  // Run all four signal sources in parallel — all are best-effort.
  const [metaRes, techRes, auditRes, cwvRes] = await Promise.allSettled([
    fetchSiteMetadata(url),
    detectTechStack(url),
    runAudit(url, { maxPages: 1, maxDepth: 0 }),
    scanCwv({ url, strategy: "mobile" }),
  ]);

  if (metaRes.status === "fulfilled") {
    out.metadata = metaRes.value;
    out.reachable = metaRes.value.reachable;
  }

  if (techRes.status === "fulfilled") {
    out.techStack = techRes.value.technologies.map((t) => t.name);
  }

  if (auditRes.status === "fulfilled") {
    out.audit = {
      score: auditRes.value.score,
      pagesCrawled: auditRes.value.pagesCrawled,
      findings: auditRes.value.findings,
    };
  } else if (auditRes.status === "rejected") {
    out.audit = {
      score: 0,
      pagesCrawled: 0,
      findings: [],
      error: (auditRes.reason as Error)?.message ?? "Audit failed",
    };
  }

  if (cwvRes.status === "fulfilled") {
    out.cwv = cwvRes.value;
  }

  return out;
}

export async function compareDomains(
  urlA: string,
  urlB: string,
): Promise<CompareResult> {
  if (!urlA?.trim() || !urlB?.trim()) {
    return { ok: false, error: "Two URLs are required." };
  }

  const [a, b] = await Promise.all([snapshot(urlA), snapshot(urlB)]);

  if (!a.reachable && !b.reachable) {
    return {
      ok: false,
      error: "Couldn't reach either site. Check the URLs and try again.",
    };
  }

  return { ok: true, a, b };
}
