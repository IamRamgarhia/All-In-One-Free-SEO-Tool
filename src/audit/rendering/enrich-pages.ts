/**
 * Optionally enrich crawled pages with Playwright-rendered DOM + lab CWV.
 * Quick audits keep render:false so this is never required.
 */

import type { CrawledPage } from "@/audit/types";
import {
  closePlaywrightBrowser,
  renderWithPlaywright,
} from "@/audit/rendering/playwright-renderer";

/** Cap rendered pages so full audits stay bounded. */
export const MAX_RENDERED_PAGES = 3;

export type EnrichRenderOptions = {
  timeoutMs: number;
  measureCwv: boolean;
  /** Max pages to open in Chromium (start URL first). */
  maxPages?: number;
};

/**
 * Mutates `pages` in place: fills renderedHtml / cwv / consoleErrors /
 * failedRequests for up to `maxPages` successful HTML fetches.
 * Failures are swallowed — rules requiring render return unmeasured.
 */
export async function enrichPagesWithRender(
  pages: CrawledPage[],
  options: EnrichRenderOptions,
): Promise<{ rendered: number; errors: string[] }> {
  const limit = Math.min(
    options.maxPages ?? MAX_RENDERED_PAGES,
    pages.length,
  );
  const errors: string[] = [];
  let rendered = 0;

  const candidates = pages
    .filter((p) => p.rawHtml && !p.error && p.status >= 200 && p.status < 400)
    .slice(0, limit);

  for (const page of candidates) {
    try {
      const result = await renderWithPlaywright(page.finalUrl || page.url, options.timeoutMs, {
        measureCwv: options.measureCwv,
      });
      page.renderedHtml = result.html;
      page.cwv = result.cwv;
      page.consoleErrors = result.consoleErrors;
      page.failedRequests = result.failedRequests;
      rendered += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${page.url}: ${message.slice(0, 200)}`);
    }
  }

  await closePlaywrightBrowser().catch(() => undefined);
  return { rendered, errors };
}
