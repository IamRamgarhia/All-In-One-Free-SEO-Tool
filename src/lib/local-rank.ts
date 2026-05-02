import { chromium, type Browser, type BrowserContext } from "playwright";

/**
 * Local rank tracker — runs a rank check with city-level location intent
 * by including the city name in the query and using Google's `gl=` country
 * targeting. Returns position + the actual URL ranking + map-pack presence.
 *
 * For true precise city-level (uule encoding), upgrade later — this version
 * gets you 90% of the way for "where do we rank in Chicago vs LA" workflows.
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

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
    viewport: { width: 1280, height: 1600 },
    locale: "en-US",
    timezoneId: "UTC",
    extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
  });
}

export type LocalRankResult = {
  query: string;
  city: string;
  domain: string;
  position: number | null;
  resultUrl: string | null;
  resultsScanned: number;
  mapPackPresent: boolean;
  error?: string;
};

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

export async function checkLocalRank(opts: {
  query: string;
  city: string;
  domain: string;
  country?: string;
}): Promise<LocalRankResult> {
  const country = (opts.country ?? "US").toUpperCase();
  const domain = normalizeDomain(opts.domain);

  // Bake the city into the query for local intent
  const localQuery = `${opts.query} ${opts.city}`.trim();

  const out: LocalRankResult = {
    query: opts.query,
    city: opts.city,
    domain,
    position: null,
    resultUrl: null,
    resultsScanned: 0,
    mapPackPresent: false,
  };

  const browser = await getBrowser();
  const context = await newContext(browser);
  const page = await context.newPage();

  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(localQuery)}&hl=en&gl=${country}&pws=0&num=50`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(700);

    const bodyText = (await page.textContent("body")) ?? "";
    if (
      /unusual traffic|verify you're not a robot|please enable cookies/i.test(
        bodyText.slice(0, 2000),
      )
    ) {
      out.error = "Google blocked the headless browser (captcha or consent).";
      return out;
    }

    // Check map pack presence
    out.mapPackPresent = await page
      .evaluate(() =>
        Boolean(
          document.querySelector(
            "[data-attrid*='Places'], [aria-label*='map'], div[role='complementary'] [data-attrid*='Local']",
          ),
        ),
      )
      .catch(() => false);

    // Pull organic links
    const links = await page.$$eval(
      "a[jsname][href^='http'], div#search a[href^='http']",
      (els) =>
        Array.from(els)
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((h) => Boolean(h)),
    );

    const filtered = links.filter(
      (h) =>
        !/^https?:\/\/(www\.)?google\./i.test(h) &&
        !/googleadservices|googleusercontent|accounts\.google/i.test(h) &&
        !/^https?:\/\/webcache\./i.test(h),
    );

    out.resultsScanned = filtered.length;

    for (let i = 0; i < filtered.length; i++) {
      if (urlMatches(filtered[i], domain)) {
        out.position = i + 1;
        out.resultUrl = filtered[i];
        return out;
      }
    }

    return out;
  } catch (err) {
    out.error = (err as Error).message;
    return out;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}
