import { type Page } from "playwright";
import { withBrowserContext } from "./browser-pool";
import { captchaUserMessage, detectCaptcha } from "./captcha-detect";

export type RankCheckResult = {
  query: string;
  domain: string;
  engine: "google" | "duckduckgo";
  position: number | null; // null if not found in top 100
  url: string | null;
  checkedAt: Date;
  device: "desktop" | "mobile";
  resultsScanned: number;
  screenshotBuffer?: Buffer;
  error?: string;
};

/**
 * Realistic mobile UA + viewport for mobile rank checks. Pixel 7 Pro user
 * agent — Google serves mobile SERP layout for known mobile fingerprints.
 */
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.91 Mobile Safari/537.36";
const MOBILE_VIEWPORT = { width: 412, height: 915 };

function normalizeDomain(input: string): string {
  return input
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function urlMatches(href: string, domain: string): boolean {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    return host === domain || host.endsWith("." + domain);
  } catch {
    return false;
  }
}

/**
 * Collapse a result URL to the identity we rank on: host + path, no
 * scheme, no www, no query, no hash, no trailing slash.
 *
 * Why this exists: a single Google (or DDG) result renders SEVERAL
 * anchors — the title link, sitelinks, breadcrumb, "About this result".
 * Counting raw hrefs made position = "index of the Nth anchor", not
 * "index of the Nth result", so a genuine #3 could be reported as #9.
 * Deduping on this key restores one entry per result.
 */
export function resultKey(href: string): string | null {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

/**
 * Reduce a raw href list to one entry per distinct result, preserving
 * SERP order. First occurrence wins — Google emits the main title link
 * before its sitelinks, so the first hit is the one whose position we
 * want.
 */
export function dedupeResults(hrefs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hrefs) {
    const key = resultKey(h);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/**
 * DuckDuckGo's HTML endpoint wraps every result in its own redirector:
 *
 *   //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=...
 *
 * Read back through the DOM these resolve to `https://duckduckgo.com/l/?...`,
 * which the old code discarded as a DuckDuckGo-internal link — so the
 * filtered list was ALWAYS empty and every DDG check reported "not
 * ranking" regardless of the real position. Since DDG is the fallback
 * used whenever Google blocks the headless browser, that was the common
 * path.
 *
 * Returns the real destination, or null when the link is a DDG ad
 * (`y.js?ad_domain=`) or can't be unwrapped.
 */
export function unwrapDuckDuckGoUrl(href: string): string | null {
  let target = href;
  try {
    // Protocol-relative hrefs (//duckduckgo.com/l/?...) need a base.
    const u = new URL(href, "https://duckduckgo.com");
    if (/(^|\.)duckduckgo\.com$/i.test(u.hostname)) {
      const uddg = u.searchParams.get("uddg");
      if (!uddg) return null;
      target = uddg;
    }
  } catch {
    return null;
  }

  try {
    const t = new URL(target);
    // DDG ad slots point at duckduckgo.com/y.js?ad_domain=... — never a
    // real organic result, and counting one would shift every genuine
    // position down by one.
    if (/(^|\.)duckduckgo\.com$/i.test(t.hostname)) return null;
    if (!/^https?:$/.test(t.protocol)) return null;
    return t.toString();
  } catch {
    return null;
  }
}

/** Google serves ~10 organic results per page since &num=100 was retired. */
const GOOGLE_RESULTS_PER_PAGE = 10;
/** 10 pages × 10 results = the "top 100" the UI promises. */
const GOOGLE_PAGES_TO_SCAN = 10;

/**
 * Non-organic hosts that show up inside #search and must never occupy a
 * rank: Google's own properties, ad click-throughs, and static assets.
 *
 * The TLD is matched as 1-2 short labels (`google.com`, `google.co.uk`)
 * followed by end-of-host, NOT as `google\.[a-z.]+` — that earlier form
 * matched greedily across dots, so a legitimate result on a host like
 * `blog.google.dev.example.com` was silently dropped from the ranking
 * and every result below it shifted up a position.
 *
 * YouTube is deliberately absent: a youtube.com result in the organic
 * block IS an organic result and has to keep its rank.
 */
export const GOOGLE_NON_ORGANIC =
  /^https?:\/\/(?:[a-z0-9-]+\.)*(?:google(?:\.[a-z]{2,3}){1,2}|googleadservices\.com|googleusercontent\.com|gstatic\.com)(?::\d+)?(?:[/?#]|$)/i;

/**
 * Pull the organic result links from a Google SERP, in order.
 *
 * The old selector (`a[jsname][href^='http']`) matched every anchor
 * Google renders — People Also Ask entries, Top Stories, video
 * carousels, sitelinks, "About this result" — so `index + 1` was the
 * index of the Nth *anchor*, not the Nth *result*, and reported
 * positions were systematically worse than reality.
 *
 * Organic results are the ones whose anchor wraps an <h3> title. That
 * holds across Google's layout churn far better than jsname/class
 * hashes do, and it naturally excludes PAA (no h3 link), ad units
 * (rendered outside #search / marked with data-text-ad), and the
 * "About this result" affordances.
 */
async function extractGoogleOrganicHrefs(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval(
    "#search a[href^='http']:has(h3), #rso a[href^='http']:has(h3)",
    (els: Element[]) =>
      els
        .filter((a) => !a.closest("[data-text-ad], .uEierd, #tads, #bottomads"))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter(Boolean),
  );

  // Layout fallback: if :has() found nothing (very old markup or a
  // stripped-down SERP), fall back to anything inside the results
  // container. Deduping downstream keeps this from over-counting.
  const raw =
    hrefs.length > 0
      ? hrefs
      : await page.$$eval("div#search a[href^='http']", (els: Element[]) =>
          els.map((a) => (a as HTMLAnchorElement).href).filter(Boolean),
        );

  return raw.filter((h: string) => !GOOGLE_NON_ORGANIC.test(h));
}

async function captureScreenshot(page: Page): Promise<Buffer | undefined> {
  try {
    // Clip to the ACTUAL viewport, not a hardcoded 1280×900. On mobile
    // checks the viewport is 412×915, so the old fixed clip asked for a
    // region wider than the page — Playwright threw and every mobile
    // rank check silently came back without its screenshot.
    const vp = page.viewportSize();
    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 70,
      fullPage: false,
      clip: {
        x: 0,
        y: 0,
        width: vp?.width ?? 1280,
        height: Math.min(vp?.height ?? 900, 900),
      },
    });
    return buffer as Buffer;
  } catch {
    return undefined;
  }
}

async function checkOnGoogle(
  query: string,
  domain: string,
  withScreenshot = false,
  locale?: { country?: string; language?: string; city?: string },
  device: "desktop" | "mobile" = "desktop",
): Promise<RankCheckResult> {
  return withBrowserContext(
    async (context) => {
      const page = await context.newPage();
      const checkedAt = new Date();
      let resultsScanned = 0;

      try {
    const country = (locale?.country ?? "US").toUpperCase();
    const lang = locale?.language ?? "en";
    // For city-level checks, prepend the city to the query — that's what
    // produces a localised SERP without needing IP-spoofing infrastructure.
    const finalQuery = locale?.city ? `${query} ${locale.city}` : query;

    const collected: string[] = [];
    let screenshotBuffer: Buffer | undefined;

    // Google stopped honouring &num=100 in late 2025 — it now returns one
    // page of ~10 results no matter what you ask for. Requesting 100 and
    // calling the result "top 100" meant anything ranking 11+ came back
    // as "not found", indistinguishable from a genuine drop-off. Page
    // through with &start= instead, stopping as soon as a page yields no
    // new results (end of index) or we find the domain.
    for (let pageIndex = 0; pageIndex < GOOGLE_PAGES_TO_SCAN; pageIndex++) {
      const start = pageIndex * GOOGLE_RESULTS_PER_PAGE;
      const url =
        `https://www.google.com/search?q=${encodeURIComponent(finalQuery)}` +
        `&hl=${encodeURIComponent(lang)}&gl=${country}&pws=0` +
        (start > 0 ? `&start=${start}` : "");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      // small delay so client-side hydration has a chance to render
      await page.waitForTimeout(500);

      // Detect captcha / consent / unusual-traffic
      const html = await page.content();
      const cap = detectCaptcha(html);
      if (cap.blocked) {
        // Blocked mid-scan: if earlier pages produced results, report what
        // we have rather than throwing the whole check away.
        if (collected.length === 0) {
          return {
            query,
            domain,
            engine: "google",
            position: null,
            url: null,
            checkedAt,
            device,
            resultsScanned: 0,
            error: captchaUserMessage(cap.reason),
          };
        }
        break;
      }

      const pageHrefs = await extractGoogleOrganicHrefs(page);

      // Screenshot the first page only — that's the one users recognise.
      if (withScreenshot && pageIndex === 0) {
        screenshotBuffer = await captureScreenshot(page);
      }

      const before = collected.length;
      collected.push(...pageHrefs);
      // Dedupe as we go so "did this page add anything?" is measured on
      // real results, not repeated sitelinks from the previous page.
      const merged = dedupeResults(collected);
      collected.length = 0;
      collected.push(...merged);

      // No new results → we've reached the end of what Google will serve.
      if (collected.length === before) break;

      // Found it — no need to keep paging.
      if (collected.some((h) => urlMatches(h, domain))) break;
    }

    const filtered = collected;
    resultsScanned = filtered.length;

    for (let i = 0; i < filtered.length; i++) {
      if (urlMatches(filtered[i], domain)) {
        return {
          query,
          domain,
          engine: "google",
          position: i + 1,
          url: filtered[i],
          checkedAt,
          device,
          resultsScanned,
          screenshotBuffer,
        };
      }
    }

    return {
      query,
      domain,
      engine: "google",
      position: null,
      url: null,
      checkedAt,
      device,
      resultsScanned,
      screenshotBuffer,
    };
  } catch (err) {
    return {
          query,
          domain,
          engine: "google",
          position: null,
          url: null,
          checkedAt,
          device,
          resultsScanned,
          error: (err as Error).message,
        };
      } finally {
        await page.close().catch(() => {});
      }
    },
    // If we're capturing a screenshot we need images to load; otherwise
    // block heavy resources to keep memory low on rank checks.
    device === "mobile"
      ? {
          viewport: MOBILE_VIEWPORT,
          userAgent: MOBILE_UA,
          blockHeavyResources: !withScreenshot,
        }
      : {
          viewport: { width: 1280, height: 900 },
          blockHeavyResources: !withScreenshot,
        },
  );
}

async function checkOnDuckDuckGo(
  query: string,
  domain: string,
  device: "desktop" | "mobile" = "desktop",
): Promise<RankCheckResult> {
  return withBrowserContext(
    async (context) => {
      const page = await context.newPage();
      const checkedAt = new Date();
      let resultsScanned = 0;

      try {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);

    // `a.result__a` is the title link; `a.result__url` is the display
    // URL for the SAME result, so taking both used to double-count every
    // entry. Title links alone give one anchor per result.
    const links = await page.$$eval("a.result__a", (els: Element[]) =>
      els.map((a) => (a as HTMLAnchorElement).href).filter(Boolean),
    );

    // Unwrap DDG's /l/?uddg= redirector and drop ad slots. Without this
    // every href looks like a duckduckgo.com link and the old filter
    // discarded all of them — which is why DDG checks always returned
    // "not ranking".
    const filtered = dedupeResults(
      links
        .map((h: string) => unwrapDuckDuckGoUrl(h))
        .filter((h): h is string => h !== null),
    );

    resultsScanned = filtered.length;

    for (let i = 0; i < filtered.length; i++) {
      if (urlMatches(filtered[i], domain)) {
        return {
          query,
          domain,
          engine: "duckduckgo",
          position: i + 1,
          url: filtered[i],
          checkedAt,
          device,
          resultsScanned,
        };
      }
    }

    return {
      query,
      domain,
      engine: "duckduckgo",
      position: null,
      url: null,
      checkedAt,
      device,
      resultsScanned,
    };
  } catch (err) {
    return {
          query,
          domain,
          engine: "duckduckgo",
          position: null,
          url: null,
          checkedAt,
          device,
          resultsScanned,
          error: (err as Error).message,
        };
      } finally {
        await page.close().catch(() => {});
      }
    },
    { viewport: { width: 1280, height: 900 } },
  );
}

/**
 * Look up the rank of `domain` for `query`. Tries Google first, falls back
 * to DuckDuckGo if Google blocks (which it often does for headless browsers).
 */
export async function checkRank(
  query: string,
  rawDomain: string,
  options: {
    screenshot?: boolean;
    country?: string;
    language?: string;
    city?: string;
    device?: "desktop" | "mobile";
  } = {},
): Promise<RankCheckResult> {
  const domain = normalizeDomain(rawDomain);
  const device = options.device ?? "desktop";

  // Lean-mode short-circuit. When the user has disabled rank checking
  // in Settings → Browser pool, we return a clear error instead of
  // launching Chrome. Saves the user from a 30s wait + the browser
  // RAM hit.
  const { getSetting } = await import("./settings-store");
  if (await getSetting<boolean>("browser.disable_rank_check")) {
    return {
      query,
      domain: rawDomain,
      engine: "google",
      position: null,
      url: null,
      checkedAt: new Date(),
      device,
      resultsScanned: 0,
      error:
        "Rank checking is disabled in Settings → Browser pool (lean mode).",
    };
  }

  if (!domain) {
    return {
      query,
      domain: rawDomain,
      engine: "google",
      position: null,
      url: null,
      checkedAt: new Date(),
      device,
      resultsScanned: 0,
      error: "Empty domain",
    };
  }

  const locale = {
    country: options.country,
    language: options.language,
    city: options.city,
  };
  const google = await checkOnGoogle(
    query,
    domain,
    options.screenshot ?? false,
    locale,
    device,
  );
  if (google.error || google.resultsScanned === 0) {
    const ddg = await checkOnDuckDuckGo(query, domain, device);
    // Prefer DDG result if Google was blocked, else return Google's null result
    if (!ddg.error || google.error) return ddg;
  }
  return google;
}

/** Close the cached browser. Call this when the process is shutting down. */
export async function shutdownBrowser(): Promise<void> {
  const { closeBrowser } = await import("./browser-pool");
  await closeBrowser();
}
