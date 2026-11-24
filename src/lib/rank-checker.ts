import { type Page } from "playwright";
import { withBrowserContext } from "./browser-pool";
import { captchaUserMessage, detectCaptcha, emptyResultsReason } from "./captcha-detect";
import { normaliseCountry } from "./countries";
import { fetchSerpViaApi, serpApiConfig, type SerpProvider } from "./serp-api";
import {
  failureFromCaptcha,
  failureFromError,
  type RankEngine,
  type RankFailure,
} from "./serp/failure";
import {
  acceptLanguageFor,
  browserLocaleFor,
  duckDuckGoRegion,
  timezoneForCountry,
} from "./serp/locale";
import { urlMatchesDomain } from "./serp/match";

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
  /** Read from a paid SERP API (serp-api.ts) rather than a browser. */
  provider?: SerpProvider;
  /** The SERP API was set up but failed; the browser answered instead. */
  apiError?: string;
  /**
   * Why each engine tried gave no answer, as codes the interface can
   * word (see serp/failure.ts). Set whenever `error` is; may also be set
   * on a success, for the engines that failed before one answered.
   */
  failures?: RankFailure[];
};

/**
 * Realistic mobile UA + viewport for mobile rank checks. Pixel 7 Pro user
 * agent — Google serves mobile SERP layout for known mobile fingerprints.
 */
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.91 Mobile Safari/537.36";
const MOBILE_VIEWPORT = { width: 412, height: 915 };

/**
 * Desktop UA for the plain-HTTP DuckDuckGo path. Must look like a real
 * browser: DDG's /html/ endpoint serves a 403 error page to obviously
 * automated clients, and a bot-shaped UA is the easiest way to trip it.
 */
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function normalizeDomain(input: string): string {
  return input
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

/**
 * Moved to serp/match.ts, which SearXNG and Brave also use: one
 * implementation of "does this URL belong to the domain", not three.
 */
const urlMatches = urlMatchesDomain;

/**
 * Decide what a finished Google scan actually means.
 *
 * Ported from the upstream project (15c000f). The paging loop below
 * exists because Google stopped honouring `&num=100`, which made
 * everything ranking 11+ report as "not found". A captcha part-way
 * through the paging reintroduces exactly that: blocked on page 3, we
 * have seen results 1-20 and never looked at 21-100, so a domain at #34
 * would come back as `position: null` with no error — identical to a
 * completed scan. Not finding it in a truncated scan is not evidence of
 * absence, so it carries a failure and the caller tries another engine.
 *
 * Finding it is unaffected: a position seen is a position, however early
 * the scan stopped.
 */
export function resolveGoogleScan(opts: {
  hrefs: string[];
  domain: string;
  /** Captcha reason the scan stopped on before the end, if it did. */
  truncatedBy: string | null;
}): { position: number | null; url: string | null; failure?: RankFailure } {
  for (let i = 0; i < opts.hrefs.length; i++) {
    if (urlMatches(opts.hrefs[i], opts.domain)) {
      return { position: i + 1, url: opts.hrefs[i] };
    }
  }
  if (opts.truncatedBy) {
    return {
      position: null,
      url: null,
      failure: {
        engine: "google",
        code: "truncated",
        scanned: opts.hrefs.length,
        detail: opts.truncatedBy,
      },
    };
  }
  return { position: null, url: null };
}

/**
 * Why a results page yielded no results, as a failure — or null when the
 * engine said it genuinely had none. Wraps `emptyResultsReason`, which
 * decides; this only gives the answer a code.
 */
export function emptyResultsFailure(
  engine: "google" | "duckduckgo",
  html: string,
): RankFailure | null {
  const reason = emptyResultsReason(engine, html);
  if (!reason) return null;
  const cap = detectCaptcha(html);
  if (cap.blocked) return failureFromCaptcha(engine, cap.reason);
  return { engine, code: "unreadable", detail: reason };
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
  const country = (locale?.country ?? "US").toUpperCase();
  const lang = locale?.language ?? "en";
  const base = { query, domain, engine: "google" as const, device };
  const fail = (
    checkedAt: Date,
    failure: RankFailure,
    extra: Partial<RankCheckResult> = {},
  ): RankCheckResult => ({
    ...base,
    position: null,
    url: null,
    checkedAt,
    resultsScanned: 0,
    ...extra,
    error: failure.detail ?? `${failure.engine}: ${failure.code}`,
    failures: [failure],
  });

  try {
    return await withBrowserContext(
      async (context) => {
        const page = await context.newPage();
        const checkedAt = new Date();
        let resultsScanned = 0;

        try {
          // For city-level checks, prepend the city to the query — that's what
          // produces a localised SERP without needing IP-spoofing infrastructure.
          const finalQuery = locale?.city ? `${query} ${locale.city}` : query;

          const collected: string[] = [];
          let screenshotBuffer: Buffer | undefined;
          // Why we stopped paging early, when stopping early leaves the
          // answer incomplete. See resolveGoogleScan.
          let truncatedBy: string | null = null;

          // Google stopped honouring &num=100 in late 2025 — it now returns one
          // page of ~10 results no matter what you ask for. Page through with
          // &start= instead, stopping as soon as a page yields no new results
          // (end of index) or we find the domain.
          for (let pageIndex = 0; pageIndex < GOOGLE_PAGES_TO_SCAN; pageIndex++) {
            const start = pageIndex * GOOGLE_RESULTS_PER_PAGE;
            const url =
              `https://www.google.com/search?q=${encodeURIComponent(finalQuery)}` +
              `&hl=${encodeURIComponent(lang)}&gl=${normaliseCountry(country)}&pws=0` +
              (start > 0 ? `&start=${start}` : "");
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
            // small delay so client-side hydration has a chance to render
            await page.waitForTimeout(500);

            // Detect captcha / consent / unusual-traffic
            const html = await page.content();
            const cap = detectCaptcha(html);
            if (cap.blocked) {
              if (collected.length === 0) {
                return fail(checkedAt, {
                  ...failureFromCaptcha("google", cap.reason),
                  detail: captchaUserMessage(cap.reason),
                });
              }
              truncatedBy = captchaUserMessage(cap.reason);
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

          // Zero results is only "not ranking" when Google said it had none.
          if (filtered.length === 0) {
            const failure = emptyResultsFailure("google", await page.content());
            if (failure) return fail(checkedAt, failure, { screenshotBuffer });
          }

          const scan = resolveGoogleScan({ hrefs: filtered, domain, truncatedBy });
          return {
            ...base,
            position: scan.position,
            url: scan.url,
            checkedAt,
            resultsScanned,
            screenshotBuffer,
            ...(scan.failure
              ? { error: scan.failure.detail, failures: [scan.failure] }
              : {}),
          };
        } catch (err) {
          return fail(checkedAt, failureFromError("google", err), { resultsScanned });
        } finally {
          await page.close().catch(() => {});
        }
      },
      // The client's market, not en-US/UTC: Google adapts the page to the
      // browser's language and clock as well as to &hl/&gl.
      {
        ...(device === "mobile"
          ? { viewport: MOBILE_VIEWPORT, userAgent: MOBILE_UA }
          : { viewport: { width: 1280, height: 900 } }),
        // If we're capturing a screenshot we need images to load; otherwise
        // block heavy resources to keep memory low on rank checks.
        blockHeavyResources: !withScreenshot,
        locale: browserLocaleFor(lang, country),
        acceptLanguage: acceptLanguageFor(lang, country),
        timezoneId: timezoneForCountry(country),
      },
    );
  } catch (err) {
    // The browser could not even start (not installed, CDP refused…).
    return fail(new Date(), failureFromError("google", err));
  }
}

/**
 * Decode the HTML entities that appear inside href attributes in raw
 * markup. `&amp;` in particular — without decoding it, `&amp;rut=...`
 * ends up inside the `uddg` query value and the unwrapped URL is wrong.
 * The DOM did this for us; parsing raw HTML does not.
 */
function decodeAttr(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/**
 * Extract result hrefs from a raw DuckDuckGo HTML SERP.
 *
 * `a.result__a` is the title link; `a.result__url` is the display URL
 * for the SAME result, so matching both double-counts every entry.
 */
export function extractDuckDuckGoHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(decodeAttr(m[1]));

  // Some responses put href before class on the same anchor.
  if (out.length === 0) {
    const re2 = /<a\b[^>]*href="([^"]+)"[^>]*class="[^"]*\bresult__a\b[^"]*"/gi;
    while ((m = re2.exec(html))) out.push(decodeAttr(m[1]));
  }
  return out;
}

/**
 * The DuckDuckGo request for a query in the client's market.
 *
 * `kl` is DuckDuckGo's region (fr-fr, be-fr, uk-en…) and accept-language
 * the language. Without them every check ran as an American search in
 * English, whatever the client's country. A city is appended to the query,
 * as for Google, since DuckDuckGo has no location parameter.
 *
 * Exported for tests.
 */
export function duckDuckGoRequest(
  query: string,
  locale: { country?: string; language?: string; city?: string } = {},
): { url: string; acceptLanguage: string; region: string } {
  const region = duckDuckGoRegion(locale.country, locale.language);
  const finalQuery = locale.city ? `${query} ${locale.city}` : query;
  const params = new URLSearchParams({ q: finalQuery, kl: region });
  return {
    url: `https://duckduckgo.com/html/?${params}`,
    acceptLanguage: acceptLanguageFor(locale.language, locale.country),
    region,
  };
}

/**
 * DuckDuckGo rank check over plain HTTP — deliberately NOT the browser
 * pool.
 *
 * `duckduckgo.com/html/` is DDG's no-JavaScript endpoint. Driving a
 * headless browser at it returns **HTTP 403**, while a plain fetch with
 * the same user-agent gets 200 and ten results. It only ever serves that
 * first page of about ten results, so a miss here means "not in those
 * ten", never "not in the top 100" — the interface says so.
 */
async function checkOnDuckDuckGo(
  query: string,
  domain: string,
  device: "desktop" | "mobile" = "desktop",
  locale: { country?: string; language?: string; city?: string } = {},
): Promise<RankCheckResult> {
  const checkedAt = new Date();
  const base = {
    query,
    domain,
    engine: "duckduckgo" as const,
    checkedAt,
    device,
  };

  const req = duckDuckGoRequest(query, locale);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(req.url, {
      signal: ctl.signal,
      headers: {
        "user-agent": device === "mobile" ? MOBILE_UA : DESKTOP_UA,
        accept: "text/html,application/xhtml+xml",
        "accept-language": req.acceptLanguage,
      },
    });

    const html = await res.text();
    return { ...base, ...readDuckDuckGoResponse(res.status, html, domain) };
  } catch (err) {
    const failure = failureFromError("duckduckgo", err);
    return {
      ...base,
      position: null,
      url: null,
      resultsScanned: 0,
      error: (err as Error).message,
      failures: [failure],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn a DuckDuckGo HTML response into a rank reading.
 *
 * Separate from the fetch so it can be run against captured pages. The
 * bug it exists for: DuckDuckGo's bot challenge arrives as HTTP 202,
 * which passed the old `res.ok` check, parsed to zero results, and was
 * returned as "not ranking" with no error.
 */
export function readDuckDuckGoResponse(
  status: number,
  html: string,
  domain: string,
): Pick<RankCheckResult, "position" | "url" | "resultsScanned" | "error" | "failures"> {
  const failed = (error: string, failure: RankFailure) => ({
    position: null,
    url: null,
    resultsScanned: 0,
    error,
    failures: [failure],
  });

  const cap = detectCaptcha(html);
  if (cap.blocked) {
    return failed(captchaUserMessage(cap.reason), failureFromCaptcha("duckduckgo", cap.reason));
  }
  if (status < 200 || status >= 300) {
    return failed(`DuckDuckGo returned HTTP ${status}.`, {
      engine: "duckduckgo",
      code: "http",
      status,
    });
  }

  // Unwrap DDG's /l/?uddg= redirector and drop ad slots.
  const filtered = dedupeResults(
    extractDuckDuckGoHrefs(html)
      .map(unwrapDuckDuckGoUrl)
      .filter((h): h is string => h !== null),
  );

  if (filtered.length === 0) {
    const failure = emptyResultsFailure("duckduckgo", html);
    if (failure) return failed(failure.detail ?? "DuckDuckGo: unreadable", failure);
  }

  const i = filtered.findIndex((h) => urlMatches(h, domain));
  return i >= 0
    ? { position: i + 1, url: filtered[i], resultsScanned: filtered.length }
    : { position: null, url: null, resultsScanned: filtered.length };
}

export type CheckRankOptions = {
  screenshot?: boolean;
  country?: string;
  language?: string;
  city?: string;
  device?: "desktop" | "mobile";
  /**
   * Do not ask Google this time: a batch sets it after Google has
   * blocked one of its keywords, because asking again a few seconds
   * later only gets the same captcha and deepens the block. The check
   * goes straight to DuckDuckGo, and the skip is recorded.
   */
  skipGoogle?: boolean;
  /** The paid API was already tried by the caller; do not ask twice. */
  skipApi?: boolean;
  /**
   * Google or nothing: no DuckDuckGo fallback. For the local grid, where
   * the question is Google's local pack and another engine's page would
   * answer a different question.
   */
  googleOnly?: boolean;
};

/**
 * Look up the rank of `domain` for `query`: the paid results API when
 * one is configured, else Google in a browser, then DuckDuckGo if Google
 * gave no answer.
 */
export async function checkRank(
  query: string,
  rawDomain: string,
  options: CheckRankOptions = {},
): Promise<RankCheckResult> {
  const domain = normalizeDomain(rawDomain);
  const device = options.device ?? "desktop";
  const failures: RankFailure[] = [];

  // A SERP API, when one is set up: Google's own results for the
  // client's country, with no browser and no captcha. On failure the
  // browser path below still runs, and says why.
  let apiError: string | undefined;
  const api = domain && !options.skipApi ? await serpApiConfig() : null;
  if (api) {
    const r = await fetchSerpViaApi(api, {
      query,
      country: options.country,
      language: options.language,
      device,
    });
    if (r.ok) {
      const hit = rankInResults(r.urls, domain);
      return {
        query,
        domain: rawDomain,
        engine: "google",
        ...hit,
        checkedAt: new Date(),
        device,
        provider: r.provider,
      };
    }
    apiError = `${r.provider === "serper" ? "Serper" : "DataForSEO"}: ${r.error}`;
    failures.push(apiFailure(r.error, apiError));
  }

  const failedEarly = (engine: RankEngine, code: RankFailure["code"], error: string): RankCheckResult => ({
    query,
    domain: rawDomain,
    engine: "google",
    position: null,
    url: null,
    checkedAt: new Date(),
    device,
    resultsScanned: 0,
    error,
    failures: [...failures, { engine, code }],
    ...(apiError ? { apiError } : {}),
  });

  if (!domain) return failedEarly("google", "emptyDomain", "Empty domain");

  const locale = {
    country: options.country,
    language: options.language,
    city: options.city,
  };

  // Lean mode switches off the BROWSER only. DuckDuckGo is a plain HTTP
  // request and costs no memory, so it still runs.
  const { getSetting } = await import("./settings-store");
  const browserDisabled = Boolean(await getSetting<boolean>("browser.disable_rank_check"));

  let google: RankCheckResult | null = null;
  if (browserDisabled) {
    failures.push({ engine: "google", code: "disabled" });
  } else if (options.skipGoogle) {
    failures.push({ engine: "google", code: "skipped" });
  } else {
    google = await checkOnGoogle(query, domain, options.screenshot ?? false, locale, device);
    // A completed Google scan, found or not, is the answer.
    if (!google.error && google.resultsScanned > 0) {
      return withApiError({ ...google, ...(failures.length ? { failures } : {}) }, apiError);
    }
    // A position seen before a block is still a position.
    if (google.position !== null) return withApiError(google, apiError);
    // Google answering "no results at all" is not a failure; it still
    // earns a look at DuckDuckGo, but nothing is reported against Google.
    if (google.error) {
      failures.push(...(google.failures ?? [{ engine: "google", code: "unknown" as const }]));
    }
  }

  if (options.googleOnly) {
    return withApiError(
      google
        ? { ...google, failures }
        : {
            query,
            domain: rawDomain,
            engine: "google",
            position: null,
            url: null,
            checkedAt: new Date(),
            device,
            resultsScanned: 0,
            error: failures.map((f) => `${f.engine}: ${f.code}`).join(" "),
            failures,
          },
      apiError,
    );
  }

  const ddg = await checkOnDuckDuckGo(query, domain, device, locale);
  if (!ddg.error) {
    return withApiError({ ...ddg, failures }, apiError);
  }
  failures.push(...(ddg.failures ?? [{ engine: "duckduckgo", code: "unknown" as const }]));
  // Both failed: name both. The fallback's reason alone hides that
  // Google was the first thing to go wrong.
  return withApiError(
    {
      ...ddg,
      error: google?.error ? `Google: ${google.error} DuckDuckGo: ${ddg.error}` : ddg.error,
      failures,
    },
    apiError,
  );
}

/** The paid API's failure as a code, recognising the usual causes. */
function apiFailure(raw: string, detail: string): RankFailure {
  const status = /HTTP (\d{3})/.exec(raw)?.[1];
  if (status === "401" || status === "403") return { engine: "api", code: "badKey", detail };
  if (status === "429") return { engine: "api", code: "rateLimited", detail };
  if (status) return { engine: "api", code: "http", status: Number(status), detail };
  return { ...failureFromError("api", new Error(raw)), detail };
}

/** Keep the API's failure visible when the browser path answered instead. */
function withApiError(r: RankCheckResult, apiError: string | undefined): RankCheckResult {
  if (!apiError) return r;
  return { ...r, apiError };
}

/** Position of the first result on the domain, among results deduped by page. */
export function rankInResults(
  urls: readonly string[],
  domain: string,
): Pick<RankCheckResult, "position" | "url" | "resultsScanned"> {
  const results = dedupeResults([...urls]);
  const i = results.findIndex((h) => urlMatches(h, domain));
  return i >= 0
    ? { position: i + 1, url: results[i], resultsScanned: results.length }
    : { position: null, url: null, resultsScanned: results.length };
}

/**
 * One real search on each live engine, separately — for the settings
 * screen's "Test" button, which must report what each engine actually
 * did rather than what the chain ended up with.
 */
export async function testLiveEngines(opts: {
  query: string;
  country?: string;
  language?: string;
}): Promise<{
  google: { ok: boolean; resultsScanned: number; failure?: RankFailure };
  duckduckgo: { ok: boolean; resultsScanned: number; failure?: RankFailure; region: string };
}> {
  const locale = { country: opts.country, language: opts.language };
  // A domain nobody ranks with: the test is about getting results back.
  const probe = "example.invalid";
  const google = await checkOnGoogle(opts.query, probe, false, locale, "desktop");
  const ddg = await checkOnDuckDuckGo(opts.query, probe, "desktop", locale);
  return {
    google: {
      ok: !google.error && google.resultsScanned > 0,
      resultsScanned: google.resultsScanned,
      failure: google.failures?.[0],
    },
    duckduckgo: {
      ok: !ddg.error,
      resultsScanned: ddg.resultsScanned,
      failure: ddg.failures?.[0],
      region: duckDuckGoRegion(opts.country, opts.language),
    },
  };
}

/** Close the cached browser. Call this when the process is shutting down. */
export async function shutdownBrowser(): Promise<void> {
  const { closeBrowser } = await import("./browser-pool");
  await closeBrowser();
}
