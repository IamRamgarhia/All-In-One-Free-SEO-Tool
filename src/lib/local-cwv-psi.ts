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
 * one to run. When PSI fails — which, with no key, it does the moment
 * Google's shared daily allowance runs out — the tool falls back to the
 * local path automatically rather than showing the user a quota error
 * for a tool called "no PSI key".
 */

import { getPageSpeedKey } from "./pagespeed";
import {
  psiBodyFailure,
  psiHttpFailure,
  psiNetworkFailure,
  type PsiFailure,
} from "./psi-error";
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

// The key reader lives in pagespeed.ts. There were two of them, reading
// the same "api.pagespeed" setting and the same env var through two
// functions — the duplicate-definition pattern CLAUDE.md's fourth rule
// is about, and the two had already drifted in their doc comments about
// what the anonymous quota actually is.

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
  const key = await getPageSpeedKey();
  if (key) params.set("key", key);

  const failed = (f: PsiFailure): CwvResult => ({
    ...empty,
    error: f.message,
    failure: f,
    source: "psi",
  });

  let data: PsiResponse;
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      // This used to forward 200 characters of Google's raw JSON, which
      // is how a user came to read "consumer 'project_number:583797351'"
      // — Google's own shared anonymous project — and reasonably conclude
      // the app was broken.
      const body = await res.text().catch(() => "");
      return failed(psiHttpFailure(res.status, body));
    }
    data = (await res.json()) as PsiResponse;
  } catch (err) {
    return failed(psiNetworkFailure(err));
  }

  if (data.error?.message) {
    return failed(psiBodyFailure(data));
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
