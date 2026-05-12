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
    const url = `https://www.google.com/search?q=${encodeURIComponent(finalQuery)}&hl=${encodeURIComponent(lang)}&gl=${country}&num=100&pws=0`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // small delay so client-side hydration has a chance to render
    await page.waitForTimeout(500);

    // Detect captcha / consent / unusual-traffic
    const html = await page.content();
    const cap = detectCaptcha(html);
    if (cap.blocked) {
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
