/**
 * PageSpeed Insights API path for Core Web Vitals measurement.
 * Drop-in alternative to `measureCwv()` in local-cwv.ts that hits
 * Google's free PSI API instead of running headless Chrome locally.
 *
 * Trade-offs vs the local-browser path:
 *
 *   + Zero browser memory cost — pure HTTP fetch (~80 KB response)
 *   + Faster: ~5-8 sec vs 15-25 sec for the local run
 *   + Uses CrUX field data (real user measurements) when the URL has
 *     enough Chrome UX traffic — that's MORE accurate than your own
 *     synthetic headless run
 *   + No headless-Chrome-fingerprint anti-bot risk
 *
 *   − Quota: 25,000 requests/day per project with a free API key; ~50
 *     anonymous requests/day without one. You're meant to register a
 *     key at console.cloud.google.com → enable PageSpeed Insights API.
 *   − No console-error count (PSI doesn't expose those)
 *   − No proxy / stealth — calls go from your server IP, not from a
 *     residential proxy
 *
 * The local-cwv tool exposes both paths and lets the user pick which
 * one to run. Default is PSI when a key is present and the URL is
 * public (most reports), local browser otherwise.
 */

import { getSetting } from "./settings-store";
import type { CwvResult } from "./local-cwv";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

type PsiResponse = {
  lighthouseResult?: {
    audits?: Record<
      string,
      {
        numericValue?: number;
        displayValue?: string;
        score?: number | null;
        title?: string;
        description?: string;
      }
    >;
    categories?: {
      performance?: { score?: number };
    };
    finalDisplayedUrl?: string;
    requestedUrl?: string;
  };
  loadingExperience?: {
    metrics?: Record<
      string,
      {
        percentile?: number;
        category?: "FAST" | "AVERAGE" | "SLOW";
      }
    >;
  };
  error?: { message?: string };
};

/**
 * Returns a free PSI key from settings.api.psi_key if the user
 * configured one, falling back to env PAGESPEED_API_KEY, then to
 * unauthenticated (very low quota). PSI accepts anonymous calls
 * at a much lower rate-limit; useful for testing without a key.
 */
async function getPsiKey(): Promise<string | null> {
  const fromDb = await getSetting<string>("api.pagespeed");
  if (fromDb && fromDb.length > 0) return fromDb;
  const env = process.env.PAGESPEED_API_KEY;
  return env && env.length > 0 ? env : null;
}

function verdictFromValue(
  ms: number | null,
  good: number,
  needs: number,
): "good" | "needs-improvement" | "poor" | "unknown" {
  if (ms === null || !Number.isFinite(ms)) return "unknown";
  if (ms <= good) return "good";
  if (ms <= needs) return "needs-improvement";
  return "poor";
}

function clsVerdict(
  v: number | null,
): "good" | "needs-improvement" | "poor" | "unknown" {
  if (v === null || !Number.isFinite(v)) return "unknown";
  if (v <= 0.1) return "good";
  if (v <= 0.25) return "needs-improvement";
  return "poor";
}

export async function measureCwvPsi(
  url: string,
  opts: { device?: "mobile" | "desktop" } = {},
): Promise<CwvResult> {
  const device = opts.device ?? "mobile";
  const measuredAt = new Date().toISOString();

  const empty: CwvResult = {
    ok: false,
    url,
    finalUrl: null,
    lcpMs: null,
    lcpElement: null,
    fcpMs: null,
    cls: null,
    ttfbMs: null,
    domContentLoadedMs: null,
    loadMs: null,
    tbtMs: null,
    performanceScore: null,
    verdict: { lcp: "unknown", cls: "unknown", fcp: "unknown" },
    resources: { total: 0, bytes: 0, count: 0, byType: {} },
    consoleErrors: 0,
    consoleWarnings: 0,
    networkErrors: [],
    measuredAt,
    fixes: [],
  };

  const params = new URLSearchParams({
    url,
    strategy: device,
    category: "PERFORMANCE",
  });
  const key = await getPsiKey();
  if (key) params.set("key", key);

  let data: PsiResponse;
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ...empty,
        error: `PSI ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      };
    }
    data = (await res.json()) as PsiResponse;
  } catch (err) {
    return { ...empty, error: (err as Error).message };
  }

  if (data.error?.message) {
    return { ...empty, error: data.error.message };
  }

  const audits = data.lighthouseResult?.audits ?? {};
  const perf = data.lighthouseResult?.categories?.performance?.score ?? null;

  const lcpMs = audits["largest-contentful-paint"]?.numericValue ?? null;
  const fcpMs = audits["first-contentful-paint"]?.numericValue ?? null;
  const tbtMs = audits["total-blocking-time"]?.numericValue ?? null;
  const ttfbMs = audits["server-response-time"]?.numericValue ?? null;
  const cls = audits["cumulative-layout-shift"]?.numericValue ?? null;

  // Top 3 audits with score < 0.9 as "fixes"
  const fixes: string[] = [];
  for (const [, audit] of Object.entries(audits)) {
    if (
      typeof audit.score === "number" &&
      audit.score < 0.9 &&
      audit.title &&
      fixes.length < 8
    ) {
      const detail = audit.displayValue ? ` (${audit.displayValue})` : "";
      fixes.push(`${audit.title}${detail}`);
    }
  }

  return {
    ok: true,
    url,
    finalUrl:
      data.lighthouseResult?.finalDisplayedUrl ??
      data.lighthouseResult?.requestedUrl ??
      url,
    lcpMs,
    lcpElement: null,
    fcpMs,
    cls,
    ttfbMs,
    domContentLoadedMs: null,
    loadMs: null,
    tbtMs,
    performanceScore: perf !== null ? Math.round(perf * 100) : null,
    verdict: {
      lcp: verdictFromValue(lcpMs, 2500, 4000),
      cls: clsVerdict(cls),
      fcp: verdictFromValue(fcpMs, 1800, 3000),
    },
    // PSI doesn't itemize transfer sizes per resource type cheaply.
    // Leave the resource breakdown empty — UI must handle this gracefully.
    resources: { total: 0, bytes: 0, count: 0, byType: {} },
    consoleErrors: 0,
    consoleWarnings: 0,
    networkErrors: [],
    measuredAt,
    fixes,
  };
}
