/**
 * Playwright rendering — optional, Wave 3.
 * Quick audits must not require a browser.
 *
 * Stub kept so the module layout matches the target architecture.
 */

export type RenderResult = {
  html: string;
  cwv?: {
    lcp?: number;
    cls?: number;
    fcp?: number;
    ttfb?: number;
    inp?: number;
  };
};

export async function renderWithPlaywright(
  _url: string,
  _timeoutMs: number,
): Promise<RenderResult> {
  throw new Error(
    "Playwright rendering is not enabled in Wave 1. Pass render:false (default).",
  );
}
