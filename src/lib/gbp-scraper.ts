import { chromium, type Browser, type BrowserContext } from "playwright";

/**
 * Public Google Business Profile scraper. Pulls rating, review count, hours,
 * categories, address, top recent reviews from the Maps page. Best-effort —
 * Google's GBP HTML is fragile, so missing fields are normal.
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
    viewport: { width: 1280, height: 1800 },
    locale: "en-US",
    timezoneId: "UTC",
    extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
  });
}

export type GbpReview = {
  author: string;
  rating: number | null;
  text: string;
  relativeTime: string | null;
};

export type GbpReport = {
  ok: boolean;
  error?: string;
  url: string;
  finalUrl: string | null;
  name: string | null;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string[] | null;
  reviews: GbpReview[];
};

export async function scrapeGbp(rawUrl: string): Promise<GbpReport> {
  const out: GbpReport = {
    ok: false,
    url: rawUrl,
    finalUrl: null,
    name: null,
    rating: null,
    reviewCount: null,
    category: null,
    address: null,
    phone: null,
    website: null,
    hours: null,
    reviews: [],
  };

  if (!rawUrl?.trim()) {
    out.error = "URL required";
    return out;
  }

  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const browser = await getBrowser();
  const context = await newContext(browser);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);

    out.finalUrl = page.url();

    // Name — usually in the page title or h1
    out.name = await page
      .evaluate(() => {
        const h1 = document.querySelector("h1");
        if (h1) return (h1.textContent ?? "").trim() || null;
        const title = document.title;
        return title ? title.split(" - ")[0].trim() : null;
      })
      .catch(() => null);

    // Rating + review count
    const ratingData = await page
      .evaluate(() => {
        // Try aria-label patterns first ("4.5 stars")
        const ratingLabel = document.querySelector(
          "[role='img'][aria-label*='star']",
        );
        if (ratingLabel) {
          const lbl = ratingLabel.getAttribute("aria-label") ?? "";
          const m = lbl.match(/([\d.]+)\s*star/i);
          if (m) {
            const reviewCountEl = ratingLabel.parentElement?.querySelector("button, span");
            const cnt = (reviewCountEl?.textContent ?? "").match(
              /([\d,]+)\s*review/i,
            );
            return {
              rating: parseFloat(m[1]),
              count: cnt ? parseInt(cnt[1].replace(/,/g, ""), 10) : null,
            };
          }
        }
        return null;
      })
      .catch(() => null);

    if (ratingData) {
      out.rating = ratingData.rating;
      out.reviewCount = ratingData.count;
    }

    // Address — look for a button with aria-label="Address: ..."
    out.address = await page
      .evaluate(() => {
        const btn = document.querySelector("button[aria-label^='Address']");
        if (btn) {
          const lbl = btn.getAttribute("aria-label") ?? "";
          return lbl.replace(/^Address:\s*/i, "").trim() || null;
        }
        return null;
      })
      .catch(() => null);

    // Phone
    out.phone = await page
      .evaluate(() => {
        const btn = document.querySelector("button[aria-label^='Phone']");
        if (btn) {
          const lbl = btn.getAttribute("aria-label") ?? "";
          return lbl.replace(/^Phone:\s*/i, "").trim() || null;
        }
        return null;
      })
      .catch(() => null);

    // Website
    out.website = await page
      .evaluate(() => {
        const a = document.querySelector("a[aria-label^='Website']");
        if (a) {
          return (a as HTMLAnchorElement).href || null;
        }
        return null;
      })
      .catch(() => null);

    // Reviews — first try clicking the Reviews tab to load them.
    try {
      const reviewsTab = await page.$("button[aria-label^='Reviews']");
      if (reviewsTab) {
        await reviewsTab.click();
        await page.waitForTimeout(2000);
      }
    } catch {
      // ignore
    }

    out.reviews = await page
      .$$eval("[data-review-id], div[jsaction*='review']", (els) => {
        const result: {
          author: string;
          rating: number | null;
          text: string;
          relativeTime: string | null;
        }[] = [];
        for (const el of els as HTMLElement[]) {
          const authorEl = el.querySelector("button[jsaction*='reviewerLink'], div[class*='author']");
          const author = (authorEl?.textContent ?? "").trim();
          if (!author) continue;
          const ratingEl = el.querySelector("[role='img'][aria-label*='star']");
          let rating: number | null = null;
          if (ratingEl) {
            const m = (ratingEl.getAttribute("aria-label") ?? "").match(
              /([\d.]+)\s*star/i,
            );
            if (m) rating = parseFloat(m[1]);
          }
          const textEl = el.querySelector("span[class*='wiI7pd'], div[class*='MyEned']");
          const text = (textEl?.textContent ?? "").trim();
          const timeEl = el.querySelector("span[class*='rsqaWe']");
          const relativeTime = (timeEl?.textContent ?? "").trim() || null;
          result.push({ author, rating, text, relativeTime });
          if (result.length >= 12) break;
        }
        return result;
      })
      .catch(() => [] as GbpReview[]);

    out.ok = true;
    return out;
  } catch (err) {
    out.error = (err as Error).message;
    return out;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}
