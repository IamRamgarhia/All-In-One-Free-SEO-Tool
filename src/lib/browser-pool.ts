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

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.isConnected()) return cachedBrowser;
  if (!browserPromise) {
    const remoteWs = await getRemoteWsEndpoint();
    if (remoteWs) {
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
      browserPromise = chromium.launch(opts);
    }
  }
  cachedBrowser = await browserPromise;
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
  try {
    const browser = await getBrowser();
    const stealth = await isStealthEnabled();
    const proxies = opts.noProxy ? [] : await getProxies();
    const proxyRaw = nextProxy(proxies);
    const proxy = proxyRaw ? parseProxy(proxyRaw) : null;

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
    if (context) {
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
  cachedBrowser = null;
  browserPromise = null;
  if (b && b.isConnected()) {
    await b.close().catch(() => {});
  }
}
