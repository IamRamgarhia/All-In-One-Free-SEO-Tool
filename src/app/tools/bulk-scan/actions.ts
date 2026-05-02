"use server";

import { runHealthCheck } from "@/app/tools/health-check/actions";
import { saveSnapshot } from "@/lib/snapshots";

export type BulkRow = {
  url: string;
  ok: boolean;
  score: number | null;
  performance: number | null;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  error?: string;
};

export type BulkScanResult = {
  rows: BulkRow[];
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
};

const MAX_URLS = 25; // bound runtime; each scan is ~30-60s
const CONCURRENCY = 4; // PageSpeed has rate limits, keep modest

function parseUrls(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`))
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, MAX_URLS);
}

export async function runBulkScan(opts: {
  urls: string;
  saveSnapshots?: boolean;
}): Promise<BulkScanResult> {
  const startedAt = new Date();
  const urls = parseUrls(opts.urls);
  const rows: BulkRow[] = [];

  // Concurrency-limited worker pool
  const queue = [...urls];
  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) return;
      try {
        const r = await runHealthCheck(url);
        if (r.ok) {
          rows.push({
            url: r.finalUrl,
            ok: true,
            score: r.summary.score,
            performance: r.summary.performanceScore,
            totalFindings: r.summary.totalFindings,
            critical: r.summary.bySeverity.critical,
            high: r.summary.bySeverity.high,
            medium: r.summary.bySeverity.medium,
            low: r.summary.bySeverity.low,
          });
          if (opts.saveSnapshots) {
            try {
              await saveSnapshot({
                clientId: null,
                kind: "cwv",
                label: r.finalUrl,
                note: "Bulk scan",
                data: r,
                primaryMetric: r.summary.score,
                primaryMetricLabel: "health",
              });
            } catch {
              // ignore snapshot failures
            }
          }
        } else {
          rows.push({
            url,
            ok: false,
            score: null,
            performance: null,
            totalFindings: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            error: r.error,
          });
        }
      } catch (err) {
        rows.push({
          url,
          ok: false,
          score: null,
          performance: null,
          totalFindings: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          error: (err as Error).message,
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker()),
  );

  // Preserve original input order
  rows.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));

  const completedAt = new Date();
  return {
    rows,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
  };
}
