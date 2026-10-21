/**
 * SEOmator `browserFetcher` backed by the app's shared Playwright pool.
 *
 * Replaces SEOmator's private Chromium launch so audits share queue, stealth,
 * proxy rotation, and resource blocking with the rest of the product.
 * Measures lab CWV including a synthetic INP click when requested.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import { withBrowserPage } from "@/lib/browser-pool";
import { guardUrl, SsrfBlockedError } from "@/lib/url-guard";

export type BrowserPoolCwv = {
  lcp?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  inp?: number;
  inpSynthetic?: boolean;
  tbt?: number;
};

export type BrowserPoolFetchResult = {
  html: string;
  statusCode: number;
  responseTime: number;
  cwv: BrowserPoolCwv;
  /** Present when we captured console / request failures during render. */
  diagnostics?: {
    pageErrors: string[];
    consoleMessages: Array<{ type: "error" | "warning"; text: string }>;
    failedRequests: Array<{ url: string; errorText?: string }>;
  };
};

export type BrowserPoolRenderOptions = {
  mobile?: boolean;
  simulateInteraction?: boolean;
  signal?: AbortSignal;
  /** Operator audits may target private LAN hosts. */
  allowPrivate?: boolean;
  /** When set, capture a viewport PNG after render (SEOmator landing preview). */
  screenshotPath?: string;
};

async function collectLabCwv(page: Page): Promise<BrowserPoolCwv> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint")?.startTime;

    let lcp: number | undefined;
    try {
      const lcpEntries = performance.getEntriesByType(
        "largest-contentful-paint",
      ) as PerformanceEntry[];
      const last = lcpEntries[lcpEntries.length - 1] as
        | (PerformanceEntry & { startTime?: number })
        | undefined;
      lcp = last?.startTime;
    } catch {
      /* older engines */
    }

    let cls = 0;
    try {
      const shifts = performance.getEntriesByType("layout-shift") as Array<
        PerformanceEntry & { value?: number; hadRecentInput?: boolean }
      >;
      for (const s of shifts) {
        if (!s.hadRecentInput) cls += s.value ?? 0;
      }
    } catch {
      /* ignore */
    }

    let tbt = 0;
    try {
      const tasks = performance.getEntriesByType("longtask") as Array<
        PerformanceEntry & { duration?: number }
      >;
      for (const t of tasks) {
        const over = (t.duration ?? 0) - 50;
        if (over > 0) tbt += over;
      }
    } catch {
      /* PerformanceObserver longtask may be unavailable */
    }

    return {
      ttfb: nav ? nav.responseStart : undefined,
      fcp,
      lcp,
      cls: cls || undefined,
      tbt: tbt || undefined,
    };
  });
}

/**
 * Render a URL via `withBrowserPage` for SEOmator's createAuditor.
 */
export async function fetchPageWithBrowserPool(
  url: string,
  timeout: number,
  options: BrowserPoolRenderOptions = {},
): Promise<BrowserPoolFetchResult> {
  const guarded = await guardUrl(url, { allowPrivate: options.allowPrivate ?? true });
  if (!guarded.ok) throw new SsrfBlockedError(guarded.reason);

  if (options.signal?.aborted) {
    throw new Error("Audit render aborted");
  }

  const started = Date.now();
  const mobile = options.mobile === true;

  return withBrowserPage(
    async (page) => {
      page.setDefaultTimeout(timeout);

      const consoleMessages: Array<{ type: "error" | "warning"; text: string }> =
        [];
      const pageErrors: string[] = [];
      const failedRequests: Array<{ url: string; errorText?: string }> = [];

      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") {
          consoleMessages.push({
            type: msg.type() === "warning" ? "warning" : "error",
            text: msg.text().slice(0, 300),
          });
        }
      });
      page.on("pageerror", (err) => {
        pageErrors.push(err.message.slice(0, 300));
      });
      page.on("requestfailed", (req) => {
        failedRequests.push({
          url: req.url(),
          errorText: req.failure()?.errorText,
        });
      });

      const response = await page.goto(guarded.url.href, {
        waitUntil: "domcontentloaded",
        timeout,
      });
      const statusCode = response?.status() ?? 0;

      // Short settle for late LCP/CLS candidates.
      await page.waitForTimeout(Math.min(1000, Math.floor(timeout / 4)));

      let cwv = await collectLabCwv(page);

      if (options.simulateInteraction) {
        try {
          const clickable = page.locator("a, button, [role='button'], input, textarea").first();
          if ((await clickable.count()) > 0) {
            const before = Date.now();
            await clickable.click({ timeout: 1500, force: true }).catch(() => undefined);
            await page.waitForTimeout(200);
            const inp = Date.now() - before;
            cwv = { ...cwv, inp, inpSynthetic: true };
          }
        } catch {
          /* synthetic INP is best-effort */
        }
      }

      if (options.screenshotPath) {
        try {
          await mkdir(path.dirname(options.screenshotPath), { recursive: true });
          const png = await page.screenshot({ type: "png", fullPage: false });
          await writeFile(options.screenshotPath, png);
        } catch {
          /* preview is best-effort */
        }
      }

      const html = await page.content();
      return {
        html,
        statusCode,
        responseTime: Date.now() - started,
        cwv,
        diagnostics: {
          pageErrors: pageErrors.slice(0, 25),
          consoleMessages: consoleMessages.slice(0, 50),
          failedRequests: failedRequests.slice(0, 50),
        },
      };
    },
    {
      viewport: mobile
        ? { width: 393, height: 852 }
        : { width: 1366, height: 768 },
      // Need CSS/layout for CWV — do not block stylesheets/images entirely.
      blockHeavyResources: false,
      userAgent: mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
    },
  );
}
