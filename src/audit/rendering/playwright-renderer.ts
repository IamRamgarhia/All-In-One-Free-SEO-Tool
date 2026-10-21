/**
 * Optional Playwright renderer for Wave 3.
 * Quick audits must keep render:false — no browser required.
 */

import { chromium, type Browser } from "playwright";

export type CoreWebVitals = {
  lcp?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  inp?: number;
  tbt?: number;
};

export type RenderResult = {
  html: string;
  finalUrl: string;
  status: number;
  cwv: CoreWebVitals;
  consoleErrors: string[];
  failedRequests: Array<{ url: string; status?: number; error?: string }>;
  timingMs: number;
};

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        channel: "chrome",
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      })
      .catch(async () =>
        chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }),
      );
  }
  return browserPromise;
}

export async function closePlaywrightBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch {
    /* ignore */
  } finally {
    browserPromise = null;
  }
}

/**
 * Render a URL with Chromium, collect DOM HTML + lab CWV + console errors.
 */
export async function renderWithPlaywright(
  url: string,
  timeoutMs: number,
  options: { measureCwv?: boolean } = {},
): Promise<RenderResult> {
  const started = Date.now();
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; SeoToolAuditBot/1.0; +https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool)",
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  const consoleErrors: string[] = [];
  const failedRequests: RenderResult["failedRequests"] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message.slice(0, 300));
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({
      url: req.url(),
      error: req.failure()?.errorText,
    });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      failedRequests.push({ url: res.url(), status: res.status() });
    }
  });

  let status = 0;
  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: timeoutMs,
    });
    status = response?.status() ?? 0;

    // Give late paints a moment for LCP/CLS.
    await page.waitForTimeout(Math.min(1500, Math.floor(timeoutMs / 4)));

    const html = await page.content();
    const finalUrl = page.url();

    let cwv: CoreWebVitals = {};
    if (options.measureCwv !== false) {
      cwv = await page.evaluate(() => {
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
          const shifts = performance.getEntriesByType(
            "layout-shift",
          ) as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>;
          for (const s of shifts) {
            if (!s.hadRecentInput) cls += s.value ?? 0;
          }
        } catch {
          /* ignore */
        }

        return {
          ttfb: nav ? nav.responseStart : undefined,
          fcp,
          lcp,
          cls: cls || undefined,
        };
      });
    }

    await context.close();
    return {
      html,
      finalUrl,
      status,
      cwv,
      consoleErrors: consoleErrors.slice(0, 25),
      failedRequests: failedRequests.slice(0, 40),
      timingMs: Date.now() - started,
    };
  } catch (err) {
    await context.close().catch(() => undefined);
    throw err;
  }
}
