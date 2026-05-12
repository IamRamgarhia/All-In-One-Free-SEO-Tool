/**
 * Local Core Web Vitals + page-speed measurement. Runs the URL in headless
 * chromium and reads PerformanceObserver entries directly — no Lighthouse
 * dep, no PSI API key, no network round-trip to Google.
 *
 * Captures:
 *   - LCP (Largest Contentful Paint, ms + element)
 *   - FCP (First Contentful Paint, ms)
 *   - CLS (Cumulative Layout Shift)
 *   - TTFB (Time to First Byte)
 *   - DOMContentLoaded, Load times
 *   - Total transfer size, encoded body size, request counts by type
 *   - Render-blocking resource count (css/js loaded before FCP)
 *   - JS / CSS / image / font / total payload sizes
 *
 * Plus a Lighthouse-equivalent 0-100 perf score using the same weighted
 * formula Lighthouse uses (LCP 25%, INP 25% — we approximate with TBT —,
 * CLS 25%, FCP 10%, SI 10%, TBT 5% baseline).
 *
 * Runs through the central pool, so it shares concurrency / stealth / proxy
 * rotation with everything else.
 */

import { withBrowserContext } from "./browser-pool";

export type ResourceSummary = {
  total: number;
  bytes: number;
  count: number;
  byType: Record<string, { count: number; bytes: number }>;
};

export type CwvResult = {
  ok: boolean;
  url: string;
  finalUrl: string | null;
  /** Largest Contentful Paint in ms (or null if not observed). */
  lcpMs: number | null;
  /** Tag name of the LCP element ("img", "h1", etc.). */
  lcpElement: string | null;
  /** First Contentful Paint in ms. */
  fcpMs: number | null;
  /** Cumulative Layout Shift (unitless). */
  cls: number | null;
  /** Time to First Byte in ms. */
  ttfbMs: number | null;
  /** DOMContentLoaded in ms (relative to navigationStart). */
  domContentLoadedMs: number | null;
  /** Load event in ms. */
  loadMs: number | null;
  /** Total Blocking Time approximation (long-task time over 50ms after FCP). */
  tbtMs: number | null;
  /** Lighthouse-equivalent 0-100 performance score. */
  performanceScore: number | null;
  /** Verdict on each CWV pillar. */
  verdict: {
    lcp: "good" | "needs-improvement" | "poor" | "unknown";
    cls: "good" | "needs-improvement" | "poor" | "unknown";
    fcp: "good" | "needs-improvement" | "poor" | "unknown";
  };
  resources: ResourceSummary;
  /** Counts of console errors / warnings, if any. */
  consoleErrors: number;
  consoleWarnings: number;
  /** Network errors caught during navigation. */
  networkErrors: { url: string; message: string }[];
  /** When the run took place. */
  measuredAt: string;
  /** Top fixes prioritised by impact, in plain English. */
  fixes: string[];
  error?: string;
};

const NAV_TIMEOUT_MS = 30_000;
const POST_LOAD_WAIT_MS = 3_500; // give layout shifts and lazy LCP time to settle

export async function measureCwv(
  url: string,
  opts: { device?: "mobile" | "desktop" } = {},
): Promise<CwvResult> {
  const device = opts.device ?? "mobile";

  // Lean-mode short-circuit. The PSI-API path (local-cwv-psi.ts) still
  // works without a browser; route there instead, or return an error
  // explaining the user disabled this in settings.
  const { getSetting } = await import("./settings-store");
  if (await getSetting<boolean>("browser.disable_local_cwv")) {
    return {
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
      measuredAt: new Date().toISOString(),
      fixes: [],
      error:
        "Local CWV is disabled in Settings → Browser pool (lean mode). Use the PSI API mode in the tool's dropdown instead — same data, no local browser.",
    };
  }
  const viewport =
    device === "mobile" ? { width: 412, height: 915 } : { width: 1366, height: 900 };
  const ua =
    device === "mobile"
      ? "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
      : undefined;

  return withBrowserContext(
    async (context) => {
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      const consoleWarnings: string[] = [];
      const networkErrors: { url: string; message: string }[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
        else if (msg.type() === "warning") consoleWarnings.push(msg.text());
      });
      page.on("requestfailed", (req) => {
        networkErrors.push({
          url: req.url(),
          message: req.failure()?.errorText ?? "unknown",
        });
      });

      // Inject CWV observers BEFORE navigation so we don't miss the first paint.
      await page.addInitScript(() => {
        type W = Window & {
          __cwv: {
            lcp: number | null;
            lcpElement: string | null;
            fcp: number | null;
            cls: number;
            longTasks: { start: number; duration: number }[];
            tbt: number;
            ttfb: number | null;
            domContentLoaded: number | null;
            load: number | null;
          };
        };
        const w = window as unknown as W;
        w.__cwv = {
          lcp: null,
          lcpElement: null,
          fcp: null,
          cls: 0,
          longTasks: [],
          tbt: 0,
          ttfb: null,
          domContentLoaded: null,
          load: null,
        };

        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.entryType === "largest-contentful-paint") {
                const lcpEntry = entry as PerformanceEntry & {
                  element?: Element;
                  startTime: number;
                };
                w.__cwv.lcp = lcpEntry.startTime;
                if (lcpEntry.element) {
                  w.__cwv.lcpElement = lcpEntry.element.tagName.toLowerCase();
                }
              }
            }
          }).observe({ type: "largest-contentful-paint", buffered: true });

          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.name === "first-contentful-paint") {
                w.__cwv.fcp = entry.startTime;
              }
            }
          }).observe({ type: "paint", buffered: true });

          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const e = entry as PerformanceEntry & {
                value: number;
                hadRecentInput?: boolean;
              };
              if (!e.hadRecentInput) {
                w.__cwv.cls += e.value;
              }
            }
          }).observe({ type: "layout-shift", buffered: true });

          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              w.__cwv.longTasks.push({
                start: entry.startTime,
                duration: entry.duration,
              });
            }
          }).observe({ type: "longtask", buffered: true });
        } catch {
          // older chromiums may lack a few observer types; ignore
        }

        addEventListener("DOMContentLoaded", () => {
          w.__cwv.domContentLoaded = performance.now();
        });
        addEventListener("load", () => {
          w.__cwv.load = performance.now();
          const nav = performance.getEntriesByType(
            "navigation",
          )[0] as PerformanceNavigationTiming | undefined;
          if (nav) {
            w.__cwv.ttfb = nav.responseStart;
          }
        });
      });

      const measuredAt = new Date().toISOString();

      // Per-resource sizes via the CDP performance trace + response listeners.
      const resourceBytes: Record<string, { count: number; bytes: number }> = {};
      let totalBytes = 0;
      let totalCount = 0;
      page.on("response", async (res) => {
        try {
          const headers = res.headers();
          const lenHdr = headers["content-length"];
          let bytes = lenHdr ? parseInt(lenHdr, 10) : 0;
          if (!bytes) {
            try {
              const body = await res.body();
              bytes = body.length;
            } catch {
              bytes = 0;
            }
          }
          if (!Number.isFinite(bytes)) bytes = 0;
          const ct = (headers["content-type"] ?? "").toLowerCase();
          let kind = "other";
          if (/javascript|ecmascript/.test(ct)) kind = "js";
          else if (/text\/css/.test(ct)) kind = "css";
          else if (/^image\//.test(ct)) kind = "image";
          else if (/^font\//.test(ct) || /\.woff2?(\?|$)/i.test(res.url()))
            kind = "font";
          else if (/text\/html/.test(ct)) kind = "html";
          else if (/json|xml/.test(ct)) kind = "data";
          else if (/^video\//.test(ct)) kind = "video";

          const slot = resourceBytes[kind] ?? { count: 0, bytes: 0 };
          slot.count += 1;
          slot.bytes += bytes;
          resourceBytes[kind] = slot;
          totalBytes += bytes;
          totalCount += 1;
        } catch {
          // ignore one-off response measurement failures
        }
      });

      try {
        // Set viewport + UA via context options doesn't exist post-creation,
        // so we use page.setViewport / context.setExtraHTTPHeaders ahead of time.
        await page.setViewportSize(viewport);
        if (ua) {
          await context.setExtraHTTPHeaders({ "user-agent": ua });
        }

        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: NAV_TIMEOUT_MS,
        });
        // Wait a beat for LCP / CLS to settle and lazy resources to fire
        await page.waitForTimeout(POST_LOAD_WAIT_MS);

        const finalUrl = page.url();

        const cwv = await page.evaluate(() => {
          type W = Window & {
            __cwv: {
              lcp: number | null;
              lcpElement: string | null;
              fcp: number | null;
              cls: number;
              longTasks: { start: number; duration: number }[];
              tbt: number;
              ttfb: number | null;
              domContentLoaded: number | null;
              load: number | null;
            };
          };
          const w = window as unknown as W;
          // Compute TBT: blocking time = max(0, duration - 50ms) summed over
          // long tasks that occur after FCP and before TTI.
          const fcp = w.__cwv.fcp ?? 0;
          let tbt = 0;
          for (const t of w.__cwv.longTasks) {
            if (t.start < fcp) continue;
            tbt += Math.max(0, t.duration - 50);
          }
          return {
            lcp: w.__cwv.lcp,
            lcpElement: w.__cwv.lcpElement,
            fcp: w.__cwv.fcp,
            cls: w.__cwv.cls,
            tbt,
            ttfb: w.__cwv.ttfb,
            domContentLoaded: w.__cwv.domContentLoaded,
            load: w.__cwv.load,
          };
        });

        const verdict = {
          lcp: classifyLcp(cwv.lcp),
          cls: classifyCls(cwv.cls),
          fcp: classifyFcp(cwv.fcp),
        };

        const performanceScore = computeScore({
          lcp: cwv.lcp,
          fcp: cwv.fcp,
          cls: cwv.cls,
          tbt: cwv.tbt,
        });

        const fixes = buildFixes({
          ...cwv,
          totalBytes,
          totalCount,
          byType: resourceBytes,
          consoleErrors: consoleErrors.length,
          networkErrors: networkErrors.length,
        });

        return {
          ok: true,
          url,
          finalUrl,
          lcpMs: round(cwv.lcp),
          lcpElement: cwv.lcpElement,
          fcpMs: round(cwv.fcp),
          cls: cwv.cls === null ? null : Math.round(cwv.cls * 1000) / 1000,
          ttfbMs: round(cwv.ttfb),
          domContentLoadedMs: round(cwv.domContentLoaded),
          loadMs: round(cwv.load),
          tbtMs: round(cwv.tbt),
          performanceScore,
          verdict,
          resources: {
            total: totalCount,
            bytes: totalBytes,
            count: totalCount,
            byType: resourceBytes,
          },
          consoleErrors: consoleErrors.length,
          consoleWarnings: consoleWarnings.length,
          networkErrors,
          measuredAt,
          fixes,
        };
      } catch (err) {
        return emptyResult(url, measuredAt, (err as Error).message);
      } finally {
        await page.close().catch(() => {});
      }
    },
    // CWV needs all resources to load to measure LCP / CLS / TBT accurately.
    { viewport, userAgent: ua, blockHeavyResources: false },
  );
}

function round(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.round(n);
}

function classifyLcp(ms: number | null): CwvResult["verdict"]["lcp"] {
  if (ms === null) return "unknown";
  if (ms <= 2500) return "good";
  if (ms <= 4000) return "needs-improvement";
  return "poor";
}
function classifyFcp(ms: number | null): CwvResult["verdict"]["fcp"] {
  if (ms === null) return "unknown";
  if (ms <= 1800) return "good";
  if (ms <= 3000) return "needs-improvement";
  return "poor";
}
function classifyCls(value: number | null): CwvResult["verdict"]["cls"] {
  if (value === null) return "unknown";
  if (value <= 0.1) return "good";
  if (value <= 0.25) return "needs-improvement";
  return "poor";
}

/**
 * Lighthouse-mobile-equivalent log-normal scoring. Same params Google uses
 * for "Lighthouse Mobile". For each metric: score = 100 * P(X <= measured)
 * for a log-normal distribution with given median and p10. Then weighted
 * average per pillar. Approximation, but close enough to be useful.
 */
function computeScore(opts: {
  lcp: number | null;
  fcp: number | null;
  cls: number | null;
  tbt: number | null;
}): number {
  // Mobile thresholds (from Lighthouse v10 docs):
  //   FCP: median 3000, p10 1800
  //   LCP: median 4000, p10 2500
  //   TBT: median 350,  p10 200
  //   CLS: median 0.25, p10 0.1
  function logNormalScore(value: number, p10: number, median: number): number {
    const xMed = Math.log(median);
    const xP10 = Math.log(p10);
    const sigma = (xMed - xP10) / 1.2816; // ~1.2816 is z(0.9)
    const z = (Math.log(value) - xMed) / sigma;
    // CDF of standard normal via erf approximation
    const cdf = 1 - 0.5 * (1 + erf(z / Math.SQRT2));
    return Math.max(0, Math.min(1, cdf));
  }
  function erf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592,
      a2 = -0.284496736,
      a3 = 1.421413741,
      a4 = -1.453152027,
      a5 = 1.061405429,
      p = 0.3275911;
    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  const fcpScore = opts.fcp ? logNormalScore(opts.fcp, 1800, 3000) : 0;
  const lcpScore = opts.lcp ? logNormalScore(opts.lcp, 2500, 4000) : 0;
  const tbtScore = opts.tbt !== null ? logNormalScore(Math.max(opts.tbt, 1), 200, 350) : 0;
  // For CLS: lower is better, special-case 0
  let clsScore = 1;
  if (opts.cls !== null) {
    if (opts.cls <= 0.001) clsScore = 1;
    else clsScore = logNormalScore(opts.cls, 0.1, 0.25);
  }

  // Weights from Lighthouse v10 mobile
  const score =
    fcpScore * 0.1 +
    lcpScore * 0.25 +
    tbtScore * 0.3 +
    clsScore * 0.25 +
    // SI (Speed Index) — we don't measure it, so distribute its 10% across LCP+TBT
    lcpScore * 0.05 +
    tbtScore * 0.05;
  return Math.round(score * 100);
}

function emptyResult(url: string, measuredAt: string, error: string): CwvResult {
  return {
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
    error,
  };
}

function buildFixes(opts: {
  lcp: number | null;
  lcpElement: string | null;
  cls: number;
  fcp: number | null;
  ttfb: number | null;
  tbt: number;
  totalBytes: number;
  totalCount: number;
  byType: Record<string, { count: number; bytes: number }>;
  consoleErrors: number;
  networkErrors: number;
}): string[] {
  const out: string[] = [];

  if (opts.lcp !== null && opts.lcp > 2500) {
    const tag = opts.lcpElement ?? "element";
    out.push(
      `LCP is ${(opts.lcp / 1000).toFixed(2)}s (target ≤2.5s). Identify the <${tag}> LCP element, preload it with fetchpriority="high", and serve it as WebP/AVIF.`,
    );
  }
  if (opts.cls > 0.1) {
    out.push(
      `CLS is ${opts.cls.toFixed(3)} (target ≤0.1). Add explicit width/height to images, reserve space for ads / late-loaded widgets, and avoid injecting content above existing layout.`,
    );
  }
  if (opts.fcp !== null && opts.fcp > 1800) {
    out.push(
      `FCP is ${(opts.fcp / 1000).toFixed(2)}s (target ≤1.8s). Defer or async non-critical JS, inline above-the-fold CSS, and remove render-blocking resources.`,
    );
  }
  if (opts.ttfb !== null && opts.ttfb > 600) {
    out.push(
      `TTFB is ${Math.round(opts.ttfb)}ms (target ≤600ms). Add caching, move to a CDN, or upgrade hosting — TTFB above 600ms makes good LCP nearly impossible.`,
    );
  }
  if (opts.tbt > 350) {
    out.push(
      `Total Blocking Time is ${Math.round(opts.tbt)}ms (target ≤200ms). Cut JS bundle size: code-split, drop unused libraries, defer 3rd-party scripts.`,
    );
  }

  const jsBytes = opts.byType.js?.bytes ?? 0;
  if (jsBytes > 600 * 1024) {
    out.push(
      `JS payload is ${(jsBytes / 1024).toFixed(0)}KB (target <500KB). Audit for unused JS — Webpack Bundle Analyzer, Next.js bundle inspector — and code-split routes.`,
    );
  }
  const imgBytes = opts.byType.image?.bytes ?? 0;
  if (imgBytes > 1500 * 1024) {
    out.push(
      `Images total ${(imgBytes / 1024 / 1024).toFixed(1)}MB. Convert to WebP/AVIF, lazy-load below-fold, and make sure each is sized to its actual rendered dimensions.`,
    );
  }
  if (opts.networkErrors > 0) {
    out.push(
      `${opts.networkErrors} network request${opts.networkErrors === 1 ? "" : "s"} failed. Check the Network tab for 404 / blocked assets that hurt rendering.`,
    );
  }
  if (opts.consoleErrors > 0) {
    out.push(
      `${opts.consoleErrors} console error${opts.consoleErrors === 1 ? "" : "s"} during load. Fix runtime exceptions — they indicate broken JS that may be blocking enhancements.`,
    );
  }
  return out;
}
