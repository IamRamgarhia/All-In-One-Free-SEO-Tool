/**
 * Chrome UX Report (CrUX) API — Google's public, anonymised real-user
 * monitoring data. Returns Core Web Vitals percentiles for any public
 * URL or origin from real Chrome users over the last 28 days.
 *
 * Free, requires an API key (same project as PageSpeed Insights). The key
 * is shared with the existing PageSpeed setting so users only configure
 * once.
 *
 * Docs: https://developer.chrome.com/docs/crux/api
 */

import { getPageSpeedKey } from "./pagespeed";

const ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";

export type CruxFormFactor = "PHONE" | "DESKTOP" | "TABLET" | "ALL_FORM_FACTORS";

export type CruxMetricBucket = {
  /** Inclusive lower bound */
  start: number;
  /** Exclusive upper bound. null = unbounded (last bucket) */
  end: number | null;
  /** Density of users falling in this bucket, 0..1 */
  density: number;
};

export type CruxMetric = {
  /** Histogram of three buckets: good, needs-improvement, poor */
  histogram: CruxMetricBucket[];
  /** 75th-percentile value used for pass/fail thresholds. */
  p75: number;
};

export type CruxResult = {
  /** Whether the URL/origin had enough traffic to return data. */
  hasData: boolean;
  /** "url" or "origin" — what scope CrUX returned. */
  scope: "url" | "origin" | null;
  /** Form factor returned ("PHONE", "DESKTOP", or "ALL_FORM_FACTORS"). */
  formFactor: CruxFormFactor | null;
  /** Date range the data covers (start..end, YYYY-MM-DD). */
  collectionPeriod: { start: string; end: string } | null;
  metrics: {
    lcp?: CruxMetric;
    inp?: CruxMetric;
    cls?: CruxMetric;
    fcp?: CruxMetric;
    ttfb?: CruxMetric;
  };
  error?: string;
};

const METRIC_KEYS = [
  "largest_contentful_paint",
  "interaction_to_next_paint",
  "cumulative_layout_shift",
  "first_contentful_paint",
  "experimental_time_to_first_byte",
] as const;

/**
 * Query CrUX for either a specific URL (preferred) or, if that has no
 * data, the origin. Only origins or URLs with enough traffic produce
 * results; quiet pages return hasData=false (not an error).
 */
export async function fetchCruxData(opts: {
  url: string;
  formFactor?: CruxFormFactor;
}): Promise<CruxResult> {
  const formFactor = opts.formFactor ?? "PHONE";
  const key = await getPageSpeedKey();
  if (!key) {
    return {
      hasData: false,
      scope: null,
      formFactor: null,
      collectionPeriod: null,
      metrics: {},
      error: "CrUX API requires a Google API key (same as PageSpeed Insights). Add one in Settings.",
    };
  }

  // Try URL-level first; CrUX returns 404 if no data, in which case
  // fall back to origin-level which is more permissive.
  const urlResult = await queryCrux(key, {
    url: opts.url,
    formFactor,
  });
  if (urlResult.hasData) return urlResult;

  let origin: string;
  try {
    origin = new URL(opts.url).origin;
  } catch {
    return {
      hasData: false,
      scope: null,
      formFactor: null,
      collectionPeriod: null,
      metrics: {},
      error: "Invalid URL",
    };
  }
  return await queryCrux(key, { origin, formFactor });
}

/**
 * Fetch BOTH URL-level and origin-level CrUX data side-by-side. Origin-level
 * is what Google rolls into the page-experience ranking signal (28-day
 * window, all pages on the origin). A page can pass URL-level CWV and still
 * fail the ranking signal if the origin as a whole is slow.
 *
 * Returns:
 *   - urlScope: data for the exact URL (or hasData=false if not enough traffic)
 *   - originScope: data for the entire origin (almost always populated)
 *   - gap: per-metric difference between URL and origin (informational)
 */
export async function fetchCruxBothScopes(opts: {
  url: string;
  formFactor?: CruxFormFactor;
}): Promise<{
  urlScope: CruxResult;
  originScope: CruxResult;
  gap: { metric: string; urlP75: number; originP75: number; delta: number }[];
}> {
  const formFactor = opts.formFactor ?? "PHONE";
  const key = await getPageSpeedKey();
  let origin = "";
  try {
    origin = new URL(opts.url).origin;
  } catch {
    // Invalid URL — return error in both scopes
    const err: CruxResult = {
      hasData: false,
      scope: null,
      formFactor: null,
      collectionPeriod: null,
      metrics: {},
      error: "Invalid URL",
    };
    return { urlScope: err, originScope: err, gap: [] };
  }
  if (!key) {
    const err: CruxResult = {
      hasData: false,
      scope: null,
      formFactor: null,
      collectionPeriod: null,
      metrics: {},
      error:
        "CrUX API requires a Google API key (same as PageSpeed Insights).",
    };
    return { urlScope: err, originScope: err, gap: [] };
  }
  const [urlScope, originScope] = await Promise.all([
    queryCrux(key, { url: opts.url, formFactor }),
    queryCrux(key, { origin, formFactor }),
  ]);
  const gap: {
    metric: string;
    urlP75: number;
    originP75: number;
    delta: number;
  }[] = [];
  if (urlScope.hasData && originScope.hasData) {
    for (const m of ["lcp", "inp", "cls", "fcp", "ttfb"] as const) {
      const u = urlScope.metrics[m]?.p75;
      const o = originScope.metrics[m]?.p75;
      if (typeof u === "number" && typeof o === "number") {
        gap.push({ metric: m, urlP75: u, originP75: o, delta: o - u });
      }
    }
  }
  return { urlScope, originScope, gap };
}

async function queryCrux(
  key: string,
  body: { url?: string; origin?: string; formFactor: CruxFormFactor },
): Promise<CruxResult> {
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        metrics: METRIC_KEYS,
      }),
    });
    if (res.status === 404) {
      return {
        hasData: false,
        scope: body.url ? "url" : "origin",
        formFactor: body.formFactor,
        collectionPeriod: null,
        metrics: {},
      };
    }
    if (!res.ok) {
      const txt = await res.text();
      return {
        hasData: false,
        scope: null,
        formFactor: null,
        collectionPeriod: null,
        metrics: {},
        error: `CrUX ${res.status}: ${txt.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as RawCruxResponse;
    return parseCruxResponse(data, body.url ? "url" : "origin");
  } catch (err) {
    return {
      hasData: false,
      scope: null,
      formFactor: null,
      collectionPeriod: null,
      metrics: {},
      error: (err as Error).message,
    };
  }
}

type RawHistogramBin = {
  start?: number;
  end?: number;
  density?: number;
};

type RawCruxResponse = {
  record?: {
    key?: { url?: string; origin?: string; formFactor?: CruxFormFactor };
    metrics?: Record<
      string,
      {
        histogram?: RawHistogramBin[];
        /** A number, except CLS: Google sends it as a string, e.g. "0.05". */
        percentiles?: { p75?: number | string | null };
      }
    >;
    collectionPeriod?: {
      firstDate?: { year: number; month: number; day: number };
      lastDate?: { year: number; month: number; day: number };
    };
  };
};

export function parseCruxResponse(
  data: RawCruxResponse,
  scope: "url" | "origin",
): CruxResult {
  if (!data.record) {
    return {
      hasData: false,
      scope,
      formFactor: null,
      collectionPeriod: null,
      metrics: {},
    };
  }
  const m = data.record.metrics ?? {};
  const cp = data.record.collectionPeriod;
  const fmt = (d?: { year: number; month: number; day: number }) =>
    d ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : "";

  return {
    hasData: true,
    scope,
    formFactor: data.record.key?.formFactor ?? null,
    collectionPeriod: cp
      ? { start: fmt(cp.firstDate), end: fmt(cp.lastDate) }
      : null,
    metrics: {
      lcp: parseMetric(m.largest_contentful_paint),
      inp: parseMetric(m.interaction_to_next_paint),
      cls: parseMetric(m.cumulative_layout_shift),
      fcp: parseMetric(m.first_contentful_paint),
      ttfb: parseMetric(m.experimental_time_to_first_byte),
    },
  };
}

function parseMetric(
  raw:
    | {
        histogram?: RawHistogramBin[];
        percentiles?: { p75?: number | string | null };
      }
    | undefined,
): CruxMetric | undefined {
  if (!raw || !raw.histogram) return undefined;
  // CLS arrives as a string: Google's API docs call it "a double encoded
  // as a string". Passed through as-is it reached `.toFixed` on the CrUX
  // page, which threw, and the URL-vs-origin gap and the origin summary
  // both skipped CLS for not being a number. A missing percentile is no
  // data; it used to become 0, which rates as "good".
  const p75 = toNumber(raw.percentiles?.p75);
  if (p75 === null) return undefined;
  return {
    histogram: raw.histogram.map((b) => ({
      start: b.start ?? 0,
      end: b.end ?? null,
      density: b.density ?? 0,
    })),
    p75,
  };
}

/** A CrUX value as a number, or null for missing, empty or "NaN". */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const fmtDate = (d?: { year: number; month: number; day: number }) =>
  d ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : "";

// =====================
// CrUX History API
// =====================
//
// https://developer.chrome.com/docs/crux/history-api — weekly collection
// periods, each a 28-day window, 25 by default and up to 40. Updated on
// Mondays. Same API key as the daily endpoint.

const HISTORY_ENDPOINT =
  "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";

type CwvKind = "lcp" | "inp" | "cls" | "fcp" | "ttfb";

const METRIC_NAMES: Record<CwvKind, string> = {
  lcp: "largest_contentful_paint",
  inp: "interaction_to_next_paint",
  cls: "cumulative_layout_shift",
  fcp: "first_contentful_paint",
  ttfb: "experimental_time_to_first_byte",
};

export type CruxHistory = {
  hasData: boolean;
  scope: "url" | "origin" | null;
  formFactor: CruxFormFactor | null;
  /** Oldest first. Neighbouring windows share three weeks of data. */
  periods: { start: string; end: string }[];
  /** One p75 per period, oldest first; null where CrUX had too little data. */
  metrics: Partial<Record<CwvKind, { p75s: (number | null)[] }>>;
  error?: string;
};

type RawHistoryResponse = {
  record?: {
    key?: { formFactor?: CruxFormFactor };
    metrics?: Record<
      string,
      { percentilesTimeseries?: { p75s?: (number | string | null)[] } }
    >;
    collectionPeriods?: {
      firstDate?: { year: number; month: number; day: number };
      lastDate?: { year: number; month: number; day: number };
    }[];
  };
};

export function parseCruxHistory(data: unknown, scope: "url" | "origin"): CruxHistory {
  const record = (data as RawHistoryResponse | null)?.record;
  if (!record) {
    return { hasData: false, scope, formFactor: null, periods: [], metrics: {} };
  }
  const metrics: CruxHistory["metrics"] = {};
  for (const kind of Object.keys(METRIC_NAMES) as CwvKind[]) {
    const series = record.metrics?.[METRIC_NAMES[kind]]?.percentilesTimeseries?.p75s;
    if (series) metrics[kind] = { p75s: series.map(toNumber) };
  }
  return {
    hasData: true,
    scope,
    formFactor: record.key?.formFactor ?? null,
    periods: (record.collectionPeriods ?? []).map((p) => ({
      start: fmtDate(p.firstDate),
      end: fmtDate(p.lastDate),
    })),
    metrics,
  };
}

export type CwvTrend = {
  latest: number | null;
  latestPeriod: { start: string; end: string } | null;
  /**
   * Four periods back: the most recent 28-day window that shares no days
   * with the latest one. Nearer windows overlap it, so a change against
   * them is partly the same weeks counted twice.
   */
  earlier: number | null;
  earlierPeriod: { start: string; end: string } | null;
  /** Percent change from earlier to latest. Higher is worse for every one of these metrics. */
  changePct: number | null;
  /** More than 20% worse — the threshold claude-seo's drift rules (MIT) use for Core Web Vitals. */
  regressed: boolean;
};

export function cwvTrend(
  p75s: readonly (number | null)[],
  periods: readonly { start: string; end: string }[],
): CwvTrend {
  const i = p75s.length - 1;
  const j = i - 4;
  const latest = i >= 0 ? p75s[i] : null;
  const earlier = j >= 0 ? p75s[j] : null;
  const changePct =
    latest !== null && earlier !== null && earlier > 0
      ? Math.round(((latest - earlier) / earlier) * 1000) / 10
      : null;
  return {
    latest,
    latestPeriod: periods[i] ?? null,
    earlier,
    earlierPeriod: j >= 0 ? (periods[j] ?? null) : null,
    changePct,
    regressed: changePct !== null && changePct > 20,
  };
}

/** Weekly p75 history for a URL, or its origin when the URL has too little traffic. */
export async function fetchCruxHistory(opts: {
  url: string;
  formFactor?: CruxFormFactor;
  periods?: number;
}): Promise<CruxHistory> {
  const none = (error: string): CruxHistory => ({
    hasData: false,
    scope: null,
    formFactor: null,
    periods: [],
    metrics: {},
    error,
  });
  const key = await getPageSpeedKey();
  if (!key) {
    return none("CrUX API requires a Google API key (same as PageSpeed Insights). Add one in Settings.");
  }
  let origin: string;
  try {
    origin = new URL(opts.url).origin;
  } catch {
    return none("Invalid URL");
  }
  const body = {
    formFactor: opts.formFactor ?? "PHONE",
    collectionPeriodCount: Math.min(Math.max(Math.trunc(opts.periods ?? 25), 1), 40),
  };
  const byUrl = await queryHistory(key, { ...body, url: opts.url });
  if (byUrl.hasData || byUrl.error) return byUrl;
  return queryHistory(key, { ...body, origin });
}

async function queryHistory(
  key: string,
  body: { url?: string; origin?: string; formFactor: CruxFormFactor; collectionPeriodCount: number },
): Promise<CruxHistory> {
  const scope = body.url ? "url" : "origin";
  try {
    const res = await fetch(`${HISTORY_ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, metrics: METRIC_KEYS }),
    });
    if (res.status === 404) {
      return { hasData: false, scope, formFactor: body.formFactor, periods: [], metrics: {} };
    }
    if (!res.ok) {
      return {
        hasData: false,
        scope: null,
        formFactor: null,
        periods: [],
        metrics: {},
        error: `CrUX ${res.status}: ${(await res.text()).slice(0, 200)}`,
      };
    }
    return parseCruxHistory(await res.json(), scope);
  } catch (err) {
    return {
      hasData: false,
      scope: null,
      formFactor: null,
      periods: [],
      metrics: {},
      error: (err as Error).message,
    };
  }
}

/**
 * Re-exported from `crux-thresholds.ts` so server callers keep the same
 * import path. Client components should import from `crux-thresholds`
 * directly to avoid pulling in the server-only key fetcher.
 */
export { ratingForMetric } from "./crux-thresholds";
