/**
 * Optional Playwright renderer for the native crawler path.
 * Uses the shared browser-pool (not a private Chromium launch).
 */

import { fetchPageWithBrowserPool } from "@/audit/rendering/browser-pool-fetcher";
import { closeBrowser } from "@/lib/browser-pool";

export type CoreWebVitals = {
  lcp?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  inp?: number;
  inpSynthetic?: boolean;
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

export async function closePlaywrightBrowser(): Promise<void> {
  await closeBrowser();
}

/**
 * Render a URL with the shared pool; collect DOM HTML + lab CWV (+ synthetic INP).
 */
export async function renderWithPlaywright(
  url: string,
  timeoutMs: number,
  options: { measureCwv?: boolean; simulateInteraction?: boolean } = {},
): Promise<RenderResult> {
  const started = Date.now();
  const result = await fetchPageWithBrowserPool(url, timeoutMs, {
    allowPrivate: true,
    simulateInteraction:
      options.simulateInteraction ?? options.measureCwv !== false,
  });

  return {
    html: result.html,
    finalUrl: url,
    status: result.statusCode,
    cwv: options.measureCwv === false ? {} : result.cwv,
    consoleErrors: (result.diagnostics?.consoleMessages ?? [])
      .filter((m) => m.type === "error")
      .map((m) => m.text),
    failedRequests: (result.diagnostics?.failedRequests ?? []).map((f) => ({
      url: f.url,
      error: f.errorText,
    })),
    timingMs: Date.now() - started,
  };
}
