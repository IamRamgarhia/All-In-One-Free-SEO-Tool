/**
 * Central headless-chromium pool. One Browser instance per process, contexts
 * created and torn down per task with three things every other browser-using
 * lib previously had to reinvent:
 *
 *   1. Concurrency cap — a semaphore so callers can `await withBrowserContext`
 *      without melting the box. Default 4, configurable in Settings.
 *   2. Stealth defaults — realistic UA, locale, timezone, viewport, hidden
 *      `navigator.webdriver`, removed automation banner. Avoids the cheap
 *      "looks like a bot" detection without pulling in playwright-extra.
 *   3. Optional proxy rotation — newline-separated proxy list in Settings,
 *      rotated round-robin per context. Useful for SERP scraping at volume.
 *
 * Existing callers (serp-scanner, rank-checker, gbp-scraper, local-rank) are
 * being migrated to use `withBrowserContext` so they share the same browser
 * + queue + stealth surface.
 */

import {
  chromium,
  type Browser,
  type BrowserContext,
  type LaunchOptions,
} from "playwright";
import { getSetting } from "./settings-store";

const REALISTIC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Memory-safe defaults — Chromium contexts cost ~250-400 MB each.
// At 2 concurrency, peak is ~800 MB which fits a 2 GB VPS comfortably.
// Power users can raise this in Settings → Browser.
const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY_HARD_CAP = 8;

let cachedBrowser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;
/**
 * True when `cachedBrowser` is a browser the USER started and we merely
 * attached to over CDP. Changes two things that would otherwise be
 * destructive: we reuse their existing context instead of making a
 * profile-less one, and we never close either.
 */
let attachedOverCdp = false;
let proxyCounter = 0;

// Simple semaphore.
let active = 0;
const waiters: Array<() => void> = [];

// Kick off the first cache refresh at module load so acquire() doesn't
// run on the DEFAULT_CONCURRENCY value for the very first request.
void Promise.resolve().then(() => refreshMaxConcurrencyCache()).catch(() => undefined);

// Cached so acquire() can make its capacity decision synchronously.
// Without a sync read, two concurrent acquires can both `await
// getSetting(...)` (which is async because it hits SQLite via a promise
// wrapper) and the event loop can interleave their increments —
// classic TOCTOU. The cached value is refreshed in the background by
// refreshMaxConcurrencyCache() on a 30s interval and on release().
let cachedMaxConcurrency: number = DEFAULT_CONCURRENCY;
let lastMaxRefreshAt = 0;

async function refreshMaxConcurrencyCache(): Promise<void> {
  const raw = await getSetting<number | string>("browser.max_concurrency");
  const n = typeof raw === "number" ? raw : Number(raw ?? "");
  if (!Number.isFinite(n) || n < 1) {
    cachedMaxConcurrency = DEFAULT_CONCURRENCY;
  } else {
    cachedMaxConcurrency = Math.min(MAX_CONCURRENCY_HARD_CAP, Math.floor(n));
  }
  lastMaxRefreshAt = Date.now();
}

/**
 * What to tell someone whose Chromium is missing — which depends entirely
 * on how they installed, and used to assume one answer.
 *
 * Issue #37 was a Windows user told to run a terminal command after
 * installing by double-clicking a launcher. The fix pointed them at the
 * launcher's new button. Then issue #47 arrived from a **Docker** install
 * on Linux — paths under `/app`, no Desktop, no launcher — and was told
 * to press that button. Fixing a message for one install mode by
 * hardcoding that mode just moves the problem to the next person.
 *
 * On Docker the cause is different too, and the advice has to match it.
 * The image is `mcr.microsoft.com/playwright:vX-noble`, which ships the
 * browsers for exactly that Playwright release. If `playwright` in
 * package.json names a different version, it looks for a browser
 * revision the image does not contain — so "not installed" means the
 * image is stale, and `playwright install` inside a running container
 * fixes it only until the container is recreated.
 */
/**
 * The service name in docker-compose.yml. Written out here because the
 * message quotes a command the reader will paste, and `docker compose
 * exec app ...` — which this said first — fails with "no such service".
 * A guard in missing-browser-message.test.ts reads the compose file and
 * fails if the two stop matching.
 */
export const COMPOSE_SERVICE = "seo";

export function missingBrowserMessage(
  env: { docker?: boolean; platform?: string } = {},
): string {
  const docker = env.docker ?? process.env.RUNNING_IN_DOCKER === "1";
  const platform = env.platform ?? process.platform;
  const scope =
    "(Only rank checks, SERP scraping and screenshots need it — audits and content tools work without it.)";

  if (docker) {
    return (
      "The headless browser is missing from this container. That usually means " +
      "the image was built before the current Playwright version, so it carries " +
      "browsers for a different release. Rebuild it: `docker compose up -d --build`. " +
      `${scope} ` +
      "To get going again without a rebuild, run " +
      `\`docker compose exec ${COMPOSE_SERVICE} npx playwright install chromium\` — but that is ` +
      "undone the next time the container is recreated."
    );
  }

  if (platform === "win32") {
    return (
      'The headless browser isn\'t installed yet. Open the SEO Tool launcher on ' +
      'your Desktop and press "Install headless browser", then try again. ' +
      `${scope} ` +
      "If you prefer a terminal: `npx playwright install chromium` in the tool's folder."
    );
  }

  return (
    "The headless browser isn't installed yet. Run " +
    "`npx playwright install chromium` in the tool's folder, then try again. " +
    `${scope}`
  );
}

function getMaxConcurrencySync(): number {
  // Trigger a background refresh if stale. Don't await — the cached
  // value is good enough for this acquire; the next one will see the
  // updated value once the refresh resolves.
  if (Date.now() - lastMaxRefreshAt > 30_000) {
    void refreshMaxConcurrencyCache().catch(() => undefined);
  }
  return cachedMaxConcurrency;
}

async function getProxies(): Promise<string[]> {
  const raw = await getSetting<string>("browser.proxies");
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function isStealthEnabled(): Promise<boolean> {
  const raw = await getSetting<boolean>("browser.stealth_enabled");
  return raw !== false; // default ON
}

export type StoredCookie = {
  domain: string;
  name: string;
  value: string;
  path?: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
};

async function getStoredCookies(): Promise<StoredCookie[]> {
  const raw = await getSetting<StoredCookie[]>("browser.cookies");
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c) =>
      c &&
      typeof c.domain === "string" &&
      typeof c.name === "string" &&
      typeof c.value === "string",
  );
}

async function acquire(): Promise<void> {
  // Race-free counter increment using a synchronously-cached cap.
  // Reading the cap async (await getSetting) inside acquire would let
  // two concurrent acquires interleave between the await and the
  // increment — both could see `active < max` and overshoot.
  // getMaxConcurrencySync returns the cached value and kicks off a
  // background refresh when stale.
  const max = getMaxConcurrencySync();
  active += 1;
  if (active <= max) return;
  active -= 1;
  await new Promise<void>((resolve) => waiters.push(resolve));
  // When release() wakes us, the slot is already accounted for.
  active += 1;
}

function release() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

/**
 * Optional remote browser endpoint. When set (via Settings → Browser
 * or the BROWSERLESS_WS_URL env var), we connect to that WebSocket
 * instead of launching local Chrome. Compatible with Browserless,
 * Cloudflare Browser Rendering, Browserbase, and any
 * chromium.connect-compatible service.
 *
 * Lets self-hosters on tiny 1-GB VPSes offload the 250-400 MB browser
 * cost per context to a managed service — typically $0-50/mo flat
 * for the hosting cost the local browser would otherwise consume.
 */
async function getRemoteWsEndpoint(): Promise<string | null> {
  const fromDb = await getSetting<string>("browser.remote_ws");
  if (fromDb && fromDb.trim()) return fromDb.trim();
  const env = process.env.BROWSERLESS_WS_URL;
  return env && env.trim() ? env.trim() : null;
}

/**
 * Attach to a Chrome the USER started, instead of launching our own.
 *
 * They run their everyday Chrome with a debugging port open:
 *
 *   chrome.exe --remote-debugging-port=9222
 *
 * and put `http://127.0.0.1:9222` in Settings. We then drive that
 * browser — their profile, their cookies, their consent choices, their
 * real fingerprint — rather than a fresh headless Chromium that every
 * search engine recognises on sight.
 *
 * Why this and not a stealth arms race: measured from this machine on
 * 30 Oct 2026, a plain request got a JS interstitial from Google, a
 * CAPTCHA from DuckDuckGo ("select all squares containing a duck") and
 * an empty shell from Bing. The honest way to look like a real browser
 * is to be one, operated by the person it belongs to — not to bolt
 * detection-evasion flags onto an automated one.
 *
 * Costs worth knowing, and the Settings copy says all three:
 *  - anything with that port open can drive the browser, so it is
 *    loopback-only and still a real exposure on a shared machine;
 *  - the tool acts as the signed-in user, in their session;
 *  - closing Chrome ends the ability to check ranks.
 */
async function getCdpEndpoint(): Promise<string | null> {
  const fromDb = await getSetting<string>("browser.cdp_url");
  if (fromDb && fromDb.trim()) return fromDb.trim();
  const env = process.env.SEO_CHROME_CDP_URL;
  return env && env.trim() ? env.trim() : null;
}

/**
 * Only loopback. A CDP endpoint is full control of a browser with no
 * authentication; pointing this at another machine would hand that
 * control to the network, and a typo in a settings box should not be
 * able to do that.
 */
export function isLoopbackCdpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
  } catch {
    return false;
  }
}

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.isConnected()) return cachedBrowser;
  if (!browserPromise) {
    const cdp = await getCdpEndpoint();
    const remoteWs = await getRemoteWsEndpoint();
    if (cdp) {
      // The user's own Chrome, first in line: if they went to the
      // trouble of opening a debug port, that is the browser they want
      // driven. Refuse a non-loopback address rather than quietly
      // ignoring it — silently falling back to headless would leave
      // them wondering why rank checks still get blocked.
      if (!isLoopbackCdpUrl(cdp)) {
        throw new Error(
          `The Chrome debugging address "${cdp}" isn't on this machine. ` +
            `A debugging port is unauthenticated full control of a browser, ` +
            `so only http://127.0.0.1:<port> or http://localhost:<port> is accepted.`,
        );
      }
      attachedOverCdp = true;
      browserPromise = chromium.connectOverCDP(cdp);
    } else if (remoteWs) {
      attachedOverCdp = false;
      // Remote browser: chromium.connect over WebSocket. The service
      // handles launch/teardown; we just attach to a running instance.
      browserPromise = chromium.connect(remoteWs);
    } else {
      const opts: LaunchOptions = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
          "--disable-features=IsolateOrigins,site-per-process",
          "--no-first-run",
          "--no-default-browser-check",
          // Memory-savers — combined these knock ~150-200 MB off each context.
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows",
          "--disable-sync",
          "--disable-default-apps",
          "--mute-audio",
          "--no-zygote",
          // Cap V8 heap so a runaway page can't grow unbounded.
          "--js-flags=--max-old-space-size=512",
        ],
      };
      attachedOverCdp = false;
      browserPromise = chromium.launch(opts);
    }

    // A failed launch must not be cached.
    //
    // `browserPromise` is only cleared by the `disconnected` handler
    // below, and that handler is attached after a SUCCESSFUL launch. So
    // when a launch rejected — Chromium not downloaded on a fresh
    // install being the common case — the rejected promise stayed in
    // this variable and every later call re-awaited the same rejection.
    // One failure poisoned rank checking, SERP scraping, screenshots and
    // PDF rendering for the whole process lifetime, all reporting the
    // original error, so it read as "this tool is broken" rather than
    // "run playwright install".
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }

  try {
    cachedBrowser = await browserPromise;
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    // See missingBrowserMessage() below for why this is not one sentence.
    // Playwright's own wording here is good but buried in a stack. Say
    // the fix on the first line, because this is the most likely error
    // anyone hits on a fresh install.
    if (/executable doesn't exist|please run the following command/i.test(message)) {
      throw new Error(missingBrowserMessage());
    }
    throw err;
  }
  // If browser ever disconnects, clear the cache so next call re-launches.
  cachedBrowser.on("disconnected", () => {
    cachedBrowser = null;
    browserPromise = null;
  });
  return cachedBrowser;
}

function nextProxy(proxies: string[]): string | null {
  if (proxies.length === 0) return null;
  const idx = proxyCounter % proxies.length;
  proxyCounter += 1;
  return proxies[idx];
}

function parseProxy(raw: string): {
  server: string;
  username?: string;
  password?: string;
} | null {
  // Accept "host:port", "http://host:port", "http://user:pass@host:port",
  // "socks5://host:port".
  try {
    const withScheme = /:\/\//.test(raw) ? raw : `http://${raw}`;
    const u = new URL(withScheme);
    const out: { server: string; username?: string; password?: string } = {
      server: `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`,
    };
    if (u.username) out.username = decodeURIComponent(u.username);
    if (u.password) out.password = decodeURIComponent(u.password);
    return out;
  } catch {
    return null;
  }
}

export type WithContextOptions = {
  /** Override viewport. Default 1280x1800 for full-page captures. */
  viewport?: { width: number; height: number };
  /** Override locale. Default "en-US". */
  locale?: string;
  /** Override timezone. Default "UTC". */
  timezoneId?: string;
  /**
   * Block resource types Playwright wastes RAM/CPU on when we only need
   * HTML. Default blocks images/fonts/media — major memory saver for
   * SERP scrapes + rank checks. Pass `false` to disable (e.g. when
   * capturing a real screenshot).
   */
  blockHeavyResources?: boolean;
  /** Override user-agent. Default = realistic Chrome 130. */
  userAgent?: string;
  /** Pass-through accept-language header. */
  acceptLanguage?: string;
  /**
   * Force-disable proxy rotation for this call (e.g. when calling a
   * proxy-incompatible internal endpoint).
   */
  noProxy?: boolean;
};

/**
 * Acquire a context, run `fn`, release everything. Use this for ANY new
 * browser work — you get the queue, stealth, and proxy rotation for free.
 *
 * `fn` receives a fresh BrowserContext, NOT a Page — make pages yourself
 * so you control timeouts and counts.
 */
export async function withBrowserContext<T>(
  fn: (ctx: BrowserContext) => Promise<T>,
  opts: WithContextOptions = {},
): Promise<T> {
  await acquire();
  let context: BrowserContext | null = null;
  /** Set when `context` is the user's own, so we never close it. */
  let borrowedContext: BrowserContext | null = null;
  try {
    const browser = await getBrowser();
    const stealth = await isStealthEnabled();
    const proxies = opts.noProxy ? [] : await getProxies();
    const proxyRaw = nextProxy(proxies);
    const proxy = proxyRaw ? parseProxy(proxyRaw) : null;

    // When attached to the user's own Chrome, reuse the context that is
    // already there. `newContext()` over CDP gives a fresh, profile-less
    // context — no cookies, no consent choices, no sign-ins — which is
    // precisely what we attached in order to get. It would look like a
    // brand-new browser to every search engine, i.e. exactly the thing
    // that gets blocked, while the user reasonably believed their real
    // profile was being used.
    //
    // It also must not be closed in `finally` below: it is their
    // browsing session, not ours to end.
    if (attachedOverCdp) {
      const existing = browser.contexts()[0];
      if (!existing) {
        throw new Error(
          "Connected to Chrome but it has no open window. Leave at least one " +
            "tab open — the tool drives your browser rather than starting its own.",
        );
      }
      borrowedContext = existing;
      context = existing;
    } else {
      context = await browser.newContext({
        userAgent: opts.userAgent ?? REALISTIC_UA,
        viewport: opts.viewport ?? { width: 1280, height: 1800 },
        locale: opts.locale ?? "en-US",
        timezoneId: opts.timezoneId ?? "UTC",
        extraHTTPHeaders: {
          "accept-language": opts.acceptLanguage ?? "en-US,en;q=0.9",
        },
        ...(proxy ? { proxy } : {}),
      });
    }

    // Block heavy resource types by default — saves ~100-200 MB per page
    // load. Disable explicitly when capturing actual screenshots/visuals.
    const blockHeavy = opts.blockHeavyResources !== false;
    if (blockHeavy) {
      await context.route("**/*", (route) => {
        const t = route.request().resourceType();
        if (
          t === "image" ||
          t === "media" ||
          t === "font" ||
          t === "stylesheet"
        ) {
          return route.abort();
        }
        return route.continue();
      });
    }

    // Inject cookies if any are stored (for logged-in scrapes / paywalls)
    const cookies = await getStoredCookies();
    if (cookies.length > 0) {
      try {
        await context.addCookies(
          cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path ?? "/",
            ...(c.expires ? { expires: c.expires } : {}),
            secure: c.secure ?? true,
            httpOnly: c.httpOnly ?? false,
            sameSite: "Lax" as const,
          })),
        );
      } catch {
        // bad cookie shape — skip silently rather than blocking the call
      }
    }

    if (stealth) {
      // Lightweight stealth: hide the things headless flags trip on.
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
        // Plugins length > 0 (real chrome usually has 3+ default plugins)
        Object.defineProperty(navigator, "plugins", {
          get: () => [1, 2, 3, 4, 5],
        });
        // languages array (real browsers have 2+)
        Object.defineProperty(navigator, "languages", {
          get: () => ["en-US", "en"],
        });
        // Permissions API quirk — headless returns "denied" for notifications,
        // real chrome returns "default".
        const orig = (navigator as Navigator & { permissions?: { query?: unknown } })
          .permissions?.query;
        if (orig && navigator.permissions) {
          const q = orig as (
            params: PermissionDescriptor,
          ) => Promise<PermissionStatus>;
          navigator.permissions.query = (
            parameters: PermissionDescriptor,
          ): Promise<PermissionStatus> =>
            parameters.name === "notifications"
              ? Promise.resolve({ state: "default" } as unknown as PermissionStatus)
              : q.call(navigator.permissions, parameters);
        }
        // window.chrome stub (headless lacks it)
        if (!(window as unknown as { chrome?: unknown }).chrome) {
          (window as unknown as { chrome: unknown }).chrome = { runtime: {} };
        }
      });
    }

    return await fn(context);
  } finally {
    // Never close a context we borrowed from the user's browser —
    // that is their window and their tabs.
    if (context && context !== borrowedContext) {
      await context.close().catch(() => {});
    }
    release();
  }
}

/**
 * Quick-and-dirty: run something with a single page already open. Most
 * single-URL lookups want this shape. Closes the page and the context.
 */
export async function withBrowserPage<T>(
  fn: (page: import("playwright").Page) => Promise<T>,
  opts: WithContextOptions = {},
): Promise<T> {
  return withBrowserContext(async (ctx) => {
    const page = await ctx.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close().catch(() => {});
    }
  }, opts);
}

/**
 * Health-check every configured proxy by making a quick HEAD request to
 * a tiny known-good URL through it. Returns per-proxy ok/latency/error
 * for the Settings UI.
 */
export type ProxyHealth = {
  raw: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
};

export async function checkProxyHealth(): Promise<ProxyHealth[]> {
  const proxies = await getProxies();
  if (proxies.length === 0) return [];

  // Route every proxy probe through acquire()/release() so health checks
  // share the SAME concurrency budget as regular browser work. Without
  // this, a "check all proxies" admin action could spawn 20 contexts in
  // parallel even while normal user scrapes are running — guaranteed
  // OOM on small VPSes and starves the user-facing queue. The previous
  // local HEALTH_CHECK_CONCURRENCY=3 cap solved the OOM in isolation
  // but ignored coexisting load.
  const results: ProxyHealth[] = new Array(proxies.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= proxies.length) return;
      const raw = proxies[i];
      const proxy = parseProxy(raw);
      if (!proxy) {
        results[i] = { raw, ok: false, latencyMs: null, error: "Unparseable proxy" };
        continue;
      }
      const start = Date.now();
      await acquire();
      let context: BrowserContext | null = null;
      try {
        const browser = await getBrowser();
        context = await browser.newContext({
          userAgent: REALISTIC_UA,
          viewport: { width: 800, height: 600 },
          proxy,
        });
        const page = await context.newPage();
        const resp = await page.goto("https://api.ipify.org/?format=json", {
          waitUntil: "domcontentloaded",
          timeout: 10_000,
        });
        if (!resp || !resp.ok()) {
          results[i] = {
            raw,
            ok: false,
            latencyMs: Date.now() - start,
            error: `HTTP ${resp?.status() ?? "no response"}`,
          };
        } else {
          results[i] = {
            raw,
            ok: true,
            latencyMs: Date.now() - start,
            error: null,
          };
        }
      } catch (err) {
        results[i] = {
          raw,
          ok: false,
          latencyMs: Date.now() - start,
          error: (err as Error).message,
        };
      } finally {
        if (context) await context.close().catch(() => {});
        release();
      }
    }
  }

  // Spin up workers up to the cached cap. acquire() inside each worker
  // enforces the real per-call limit; this just avoids spawning more
  // worker promises than we could ever serve at once.
  const workerCount = Math.min(getMaxConcurrencySync(), proxies.length);
  await Promise.all(Array.from({ length: Math.max(1, workerCount) }, worker));
  return results;
}

/** Diagnostics — read by Settings UI to surface current pool state. */
export function poolStats() {
  return {
    active,
    queued: waiters.length,
    proxyCounter,
    browserConnected: !!(cachedBrowser && cachedBrowser.isConnected()),
  };
}

/**
 * Force-close the cached browser. Call from Settings if a user changes
 * proxy / stealth / concurrency settings — the next call gets a fresh
 * browser with new defaults.
 */
export async function closeBrowser(): Promise<void> {
  const b = cachedBrowser;
  const borrowed = attachedOverCdp;
  cachedBrowser = null;
  browserPromise = null;
  attachedOverCdp = false;
  if (!b || !b.isConnected()) return;
  if (borrowed) {
    // Deliberately does NOT call close(). We attached to a browser the
    // user started; `Browser.close()` over CDP can take the whole
    // browser down with it — every tab they had open — because a
    // setting was saved or a rank run finished. Playwright exposes no
    // public "disconnect", so the reference is dropped and the socket
    // is left for process exit to reap. A leaked socket is a much
    // smaller problem than closing somebody's browser out from under
    // them.
    return;
  }
  await b.close().catch(() => {});
}
