import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export type RankCheckResult = {
  query: string;
  domain: string;
  engine: "google" | "duckduckgo";
  position: number | null; // null if not found in top 100
  url: string | null;
  checkedAt: Date;
  resultsScanned: number;
  screenshotBuffer?: Buffer;
  error?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

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

let cachedBrowser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.isConnected()) return cachedBrowser;
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
      ],
    });
  }
  cachedBrowser = await browserPromise;
  return cachedBrowser;
}

async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "UTC",
    extraHTTPHeaders: {
      "accept-language": "en-US,en;q=0.9",
    },
  });
}

async function captureScreenshot(page: Page): Promise<Buffer | undefined> {
  try {
    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 70,
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 900 },
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
): Promise<RankCheckResult> {
  const browser = await getBrowser();
  const context = await newContext(browser);
  const page = await context.newPage();
  const checkedAt = new Date();
  let resultsScanned = 0;

  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=100&pws=0`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // small delay so client-side hydration has a chance to render
    await page.waitForTimeout(500);

    // Detect "unusual traffic" / consent / captcha pages
    const bodyText = (await page.textContent("body")) ?? "";
    if (
      /unusual traffic|verify you're not a robot|please enable cookies/i.test(
        bodyText.slice(0, 2000),
      )
    ) {
      return {
        query,
        domain,
        engine: "google",
        position: null,
        url: null,
        checkedAt,
        resultsScanned: 0,
        error: "Google blocked the headless browser (captcha or consent page).",
      };
    }

    // Organic result links — Google's classic shape
    const links = await page.$$eval(
      "a[jsname][href^='http']",
      (els) =>
        Array.from(els)
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href): href is string => Boolean(href)),
    );

    // Fallback selector if jsname is missing in this layout
    const allHrefs =
      links.length > 0
        ? links
        : await page.$$eval(
            "div#search a[href^='http']",
            (els) =>
              Array.from(els).map((a) => (a as HTMLAnchorElement).href),
          );

    // Skip Google ad / accounts / support links
    const filtered = allHrefs.filter(
      (h) =>
        !/^https?:\/\/(www\.)?google\./i.test(h) &&
        !/googleadservices|googleusercontent|accounts\.google/i.test(h) &&
        !/^https?:\/\/webcache\./i.test(h),
    );

    resultsScanned = filtered.length;

    const screenshotBuffer = withScreenshot
      ? await captureScreenshot(page)
      : undefined;

    for (let i = 0; i < filtered.length; i++) {
      if (urlMatches(filtered[i], domain)) {
        return {
          query,
          domain,
          engine: "google",
          position: i + 1,
          url: filtered[i],
          checkedAt,
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
      resultsScanned,
      error: (err as Error).message,
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function checkOnDuckDuckGo(
  query: string,
  domain: string,
): Promise<RankCheckResult> {
  const browser = await getBrowser();
  const context = await newContext(browser);
  const page = await context.newPage();
  const checkedAt = new Date();
  let resultsScanned = 0;

  try {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);

    const links = await page.$$eval(
      "a.result__a, a.result__url",
      (els) =>
        Array.from(els)
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href): href is string => Boolean(href)),
    );

    const filtered = links.filter(
      (h) => !/^https?:\/\/(www\.)?duckduckgo\.com/i.test(h),
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
      resultsScanned,
      error: (err as Error).message,
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

/**
 * Look up the rank of `domain` for `query`. Tries Google first, falls back
 * to DuckDuckGo if Google blocks (which it often does for headless browsers).
 */
export async function checkRank(
  query: string,
  rawDomain: string,
  options: { screenshot?: boolean } = {},
): Promise<RankCheckResult> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) {
    return {
      query,
      domain: rawDomain,
      engine: "google",
      position: null,
      url: null,
      checkedAt: new Date(),
      resultsScanned: 0,
      error: "Empty domain",
    };
  }

  const google = await checkOnGoogle(query, domain, options.screenshot ?? false);
  if (google.error || google.resultsScanned === 0) {
    const ddg = await checkOnDuckDuckGo(query, domain);
    // Prefer DDG result if Google was blocked, else return Google's null result
    if (!ddg.error || google.error) return ddg;
  }
  return google;
}

/** Close the cached browser. Call this when the process is shutting down. */
export async function shutdownBrowser(): Promise<void> {
  if (cachedBrowser) {
    await cachedBrowser.close().catch(() => {});
    cachedBrowser = null;
    browserPromise = null;
  }
}
