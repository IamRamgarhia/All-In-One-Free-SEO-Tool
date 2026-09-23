import { getSetting } from "./settings-store";
import { psiHttpFailure, psiNetworkFailure } from "./psi-error";

/**
 * PageSpeed Insights API — free, 25,000 requests/day. The user can paste a
 * key in Settings, or set PAGESPEED_API_KEY env var, or skip entirely (the
 * API works without a key, just rate-limited).
 */

export type CwvScanResult = {
  ok: boolean;
  url: string;
  strategy: "mobile" | "desktop";
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  ttfbMs: number | null;
  fcpMs: number | null;
  tbtMs: number | null;
  opportunities: {
    id: string;
    title: string;
    savingsMs: number | null;
    description: string;
  }[];
  /** Resource-byte breakdown (from Lighthouse 'resource-summary' audit). */
  bytesByType?: {
    document?: number;
    stylesheet?: number;
    script?: number;
    image?: number;
    font?: number;
    other?: number;
  };
  totalBytes?: number;
  requestCount?: number;
  overall: "pass" | "needs_improvement" | "fail" | null;
  error?: string;
};

export async function getPageSpeedKey(): Promise<string | null> {
  const fromDb = await getSetting<string>("api.pagespeed");
  if (fromDb && fromDb.length > 0) return fromDb;
  return process.env.PAGESPEED_API_KEY ?? null;
}

const empty = (url: string, strategy: "mobile" | "desktop"): CwvScanResult => ({
  ok: false,
  url,
  strategy,
  performance: null,
  accessibility: null,
  bestPractices: null,
  seo: null,
  lcpMs: null,
  inpMs: null,
  cls: null,
  ttfbMs: null,
  fcpMs: null,
  tbtMs: null,
  opportunities: [],
  overall: null,
});

export async function scanCwv(opts: {
  url: string;
  strategy?: "mobile" | "desktop";
}): Promise<CwvScanResult> {
  const strategy = opts.strategy ?? "mobile";
  const out = empty(opts.url, strategy);

  const key = await getPageSpeedKey();
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  endpoint.searchParams.set("url", opts.url);
  endpoint.searchParams.set("strategy", strategy);
  for (const cat of ["performance", "accessibility", "best-practices", "seo"]) {
    endpoint.searchParams.append("category", cat);
  }
  if (key) endpoint.searchParams.set("key", key);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90_000);

  let res: Response;
  try {
    res = await fetch(endpoint.toString(), {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
  } catch (err) {
    out.error = psiNetworkFailure(err).message;
    clearTimeout(t);
    return out;
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    // Was `PageSpeed API ${res.status}`, which told the reader a number
    // and nothing they could act on. The commonest value by far is 429 —
    // Google's keyless quota, shared by every install — and the fix is a
    // free key the message never mentioned.
    const body = await res.text().catch(() => "");
    out.error = psiHttpFailure(res.status, body).message;
    return out;
  }

  type PsiResponse = {
    lighthouseResult?: {
      categories?: Record<string, { score: number | null }>;
      audits?: Record<
        string,
        {
          numericValue?: number;
          displayValue?: string;
          title?: string;
          description?: string;
          details?: {
            overallSavingsMs?: number;
            items?: {
              resourceType?: string;
              transferSize?: number;
              requestCount?: number;
            }[];
          };
        }
      >;
    };
    loadingExperience?: {
      metrics?: Record<
        string,
        { percentile?: number; category?: string }
      >;
    };
  };

  const data = (await res.json()) as PsiResponse;
  const cats = data.lighthouseResult?.categories ?? {};
  const audits = data.lighthouseResult?.audits ?? {};

  out.performance = scoreToInt(cats["performance"]?.score);
  out.accessibility = scoreToInt(cats["accessibility"]?.score);
  out.bestPractices = scoreToInt(cats["best-practices"]?.score);
  out.seo = scoreToInt(cats["seo"]?.score);

  // Resource-summary audit: per-type byte weight + total
  const rsItems = (audits["resource-summary"]?.details?.items ?? []) as {
    resourceType?: string;
    transferSize?: number;
    requestCount?: number;
  }[];
  if (rsItems.length > 0) {
    const bytes: NonNullable<CwvScanResult["bytesByType"]> = {};
    let total = 0;
    let reqs = 0;
    for (const item of rsItems) {
      const t = item.resourceType ?? "";
      const sz = item.transferSize ?? 0;
      const rc = item.requestCount ?? 0;
      if (t === "document") bytes.document = (bytes.document ?? 0) + sz;
      else if (t === "stylesheet")
        bytes.stylesheet = (bytes.stylesheet ?? 0) + sz;
      else if (t === "script") bytes.script = (bytes.script ?? 0) + sz;
      else if (t === "image") bytes.image = (bytes.image ?? 0) + sz;
      else if (t === "font") bytes.font = (bytes.font ?? 0) + sz;
      else if (t === "other" || t === "media")
        bytes.other = (bytes.other ?? 0) + sz;
      if (t === "total") {
        total = sz;
        reqs = rc;
      }
    }
    out.bytesByType = bytes;
    out.totalBytes = total;
    out.requestCount = reqs;
  }

  out.lcpMs = round(audits["largest-contentful-paint"]?.numericValue);
  out.inpMs = round(audits["interaction-to-next-paint"]?.numericValue);
  const clsRaw = audits["cumulative-layout-shift"]?.numericValue;
  out.cls = typeof clsRaw === "number" ? Math.round(clsRaw * 100) : null;
  out.ttfbMs = round(audits["server-response-time"]?.numericValue);
  out.fcpMs = round(audits["first-contentful-paint"]?.numericValue);
  out.tbtMs = round(audits["total-blocking-time"]?.numericValue);

  // Opportunities — biggest savings first
  const oppKeys = [
    "render-blocking-resources",
    "uses-optimized-images",
    "modern-image-formats",
    "uses-text-compression",
    "uses-rel-preconnect",
    "uses-rel-preload",
    "unused-css-rules",
    "unused-javascript",
    "efficient-animated-content",
    "duplicated-javascript",
    "legacy-javascript",
    "third-party-summary",
    "non-composited-animations",
    "unminified-css",
    "unminified-javascript",
    "uses-responsive-images",
  ];
  out.opportunities = oppKeys
    .map((k) => {
      const a = audits[k];
      if (!a || !a.title) return null;
      const ms = a.details?.overallSavingsMs ?? 0;
      if (ms < 50) return null;
      return {
        id: k,
        title: a.title,
        savingsMs: typeof ms === "number" ? Math.round(ms) : null,
        description: (a.description ?? "").replace(/\[.+?\]\(.+?\)/g, "").trim(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0))
    .slice(0, 8);

  // Overall verdict — Google's CWV thresholds
  out.overall = verdict(out);
  out.ok = true;
  return out;
}

function scoreToInt(s: number | null | undefined): number | null {
  if (typeof s !== "number") return null;
  return Math.round(s * 100);
}
function round(v: number | undefined): number | null {
  return typeof v === "number" ? Math.round(v) : null;
}

function verdict(
  r: Omit<CwvScanResult, "overall" | "ok" | "error">,
): "pass" | "needs_improvement" | "fail" {
  // Google CWV thresholds: LCP ≤2500 good, ≤4000 needs improvement
  // INP ≤200 good, ≤500 NI; CLS ≤0.1 good, ≤0.25 NI
  let goods = 0;
  let bads = 0;
  const lcp = r.lcpMs;
  if (lcp !== null) {
    if (lcp <= 2500) goods++;
    else if (lcp > 4000) bads++;
  }
  const inp = r.inpMs;
  if (inp !== null) {
    if (inp <= 200) goods++;
    else if (inp > 500) bads++;
  }
  const cls = r.cls;
  if (cls !== null) {
    if (cls <= 10) goods++;
    else if (cls > 25) bads++;
  }
  if (bads > 0) return "fail";
  if (goods >= 2) return "pass";
  return "needs_improvement";
}
