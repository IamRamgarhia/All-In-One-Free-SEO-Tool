"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Save, XCircle, Zap } from "lucide-react";
import {
  saveBrowserSettings,
  testProxies,
  type BrowserSettingsState,
  type ProxyHealthState,
} from "./browser-actions";

export function BrowserForm({
  initial,
}: {
  initial: {
    maxConcurrency: number;
    proxies: string;
    stealth: boolean;
    cookies: string;
    cookieCount: number;
    remoteWs: string;
    disableRank: boolean;
    disableCwv: boolean;
    disableSerp: boolean;
    allowGbpScraper: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState<
    BrowserSettingsState | null,
    FormData
  >(saveBrowserSettings, null);
  const [health, setHealth] = useState<ProxyHealthState | null>(null);
  const [testing, startTest] = useTransition();

  function runTest() {
    setHealth(null);
    startTest(async () => {
      const r = await testProxies();
      setHealth(r);
    });
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[160px_1fr]">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Max concurrency</span>
          <input
            type="number"
            name="maxConcurrency"
            defaultValue={initial.maxConcurrency}
            min={1}
            max={16}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <span className="block text-[10px] text-muted-foreground">
            How many browser contexts can run in parallel. Default 4.
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            name="stealth"
            defaultChecked={initial.stealth}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="font-medium text-foreground">
              Stealth mode (recommended)
            </span>
            <span className="block text-muted-foreground">
              Hides headless-browser fingerprints — navigator.webdriver,
              plugins, languages, permissions API quirks. Reduces captcha
              triggers on Google + paywalled sites.
            </span>
          </span>
        </label>
      </div>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">
          Outbound proxies (one per line — optional, rotated round-robin)
        </span>
        <textarea
          name="proxies"
          defaultValue={initial.proxies}
          rows={4}
          placeholder={
            "http://user:pass@proxy.example.com:8080\nhttp://10.0.0.5:3128\nsocks5://my-proxy:1080"
          }
          className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 font-mono text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <span className="block text-[10px] text-muted-foreground">
          Leave empty for direct connection. With proxies set, every browser
          context gets the next one in the list. Supports{" "}
          <code>http://</code> and <code>socks5://</code> with optional
          user:pass.
        </span>
      </label>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">
          Cookie jar (logged-in scrapes — {initial.cookieCount} cookie
          {initial.cookieCount === 1 ? "" : "s"} stored)
        </span>
        <textarea
          name="cookies"
          defaultValue={initial.cookies}
          rows={4}
          placeholder={
            "Format A (TAB-separated):\nexample.com\tsession_id\tabc123\n\nOR Format B (header-style):\nexample.com: session_id=abc123; csrf=xyz"
          }
          className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 font-mono text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <span className="block text-[10px] text-muted-foreground">
          Used for logged-in scraping (paywalled sites, staging behind auth,
          GSC alternative views). Cookies inject into every browser context.
          Leave empty if not needed.
        </span>
      </label>

      {/* Remote browser service — offload Chrome to a managed
          endpoint. Compatible with Browserless / Cloudflare Browser
          Rendering / Browserbase. When set, this server skips local
          Chrome entirely (peak RAM drops by ~400-800 MB). */}
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">
          Remote browser endpoint (WebSocket URL) — optional
        </span>
        <input
          name="remoteWs"
          type="text"
          defaultValue={initial.remoteWs}
          placeholder="wss://chrome.browserless.io?token=YOUR_TOKEN"
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 font-mono text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <span className="block text-[10px] text-muted-foreground">
          Drops local Chrome entirely — connects to Browserless,
          Cloudflare Browser Rendering, Browserbase, or any
          chromium.connect-compatible service. Saves ~400-800 MB RAM
          on the server. Leave empty to use local browser. Env var
          BROWSERLESS_WS_URL also works.
        </span>
      </label>

      {/* Lean-mode toggles — disable specific browser-dependent tools
          to free RAM on small hosts. Each turns off ONE feature; the
          tool's page still renders but shows a "disabled" notice. */}
      <fieldset className="space-y-2 rounded-lg border border-white/[0.06] bg-black/20 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Lean mode — disable browser tools to save RAM
        </legend>
        <p className="text-[10px] text-muted-foreground">
          Each checkbox turns off one browser-using feature. Useful on
          small VPSes where you don&apos;t need every tool.
        </p>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="disableRank"
            defaultChecked={initial.disableRank}
            className="size-4 rounded border-white/20 bg-card/60"
          />
          <span>
            Disable rank checking
            <span className="ml-1 text-[10px] text-muted-foreground">
              (daily Google SERP scrapes)
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="disableCwv"
            defaultChecked={initial.disableCwv}
            className="size-4 rounded border-white/20 bg-card/60"
          />
          <span>
            Disable local Core Web Vitals
            <span className="ml-1 text-[10px] text-muted-foreground">
              (PSI API path still works without a browser)
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="disableSerp"
            defaultChecked={initial.disableSerp}
            className="size-4 rounded border-white/20 bg-card/60"
          />
          <span>
            Disable SERP feature scanner
            <span className="ml-1 text-[10px] text-muted-foreground">
              (AI Overview / featured-snippet / PAA detection)
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="allowGbpScraper"
            defaultChecked={initial.allowGbpScraper}
            className="size-4 rounded border-white/20 bg-card/60"
          />
          <span>
            Allow GBP scraper fallback
            <span className="ml-1 text-[10px] text-muted-foreground">
              (OFF by default — prefer official GBP API)
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-3 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 size-3" />
              Save
            </>
          )}
        </button>
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="inline-flex h-9 items-center rounded-md bg-cyan-500/15 px-4 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {testing ? (
            <>
              <Loader2 className="mr-2 size-3 animate-spin" />
              Testing proxies…
            </>
          ) : (
            <>
              <Zap className="mr-2 size-3" />
              Test proxies
            </>
          )}
        </button>
        {state?.ok && state.message && (
          <span className="text-xs text-emerald-300">{state.message}</span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-rose-300">{state.error}</span>
        )}
      </div>

      {health && health.ok && health.results.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No proxies configured. Add one above and save first.
        </p>
      )}
      {health && health.ok && health.results.length > 0 && (
        <ul className="space-y-1 text-xs">
          {health.results.map((r) => (
            <li
              key={r.raw}
              className={`flex items-center justify-between rounded-md px-3 py-2 ring-1 ring-inset ${
                r.ok
                  ? "bg-emerald-500/5 ring-emerald-500/20"
                  : "bg-rose-500/5 ring-rose-500/20"
              }`}
            >
              <code className="break-all">{r.raw}</code>
              <span
                className={`flex shrink-0 items-center gap-1 ${r.ok ? "text-emerald-300" : "text-rose-300"}`}
              >
                {r.ok ? (
                  <>
                    <CheckCircle2 className="size-3" />
                    {r.latencyMs}ms
                  </>
                ) : (
                  <>
                    <XCircle className="size-3" />
                    {r.error?.slice(0, 60) ?? "fail"}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {health && !health.ok && (
        <p className="text-xs text-rose-300">{health.error}</p>
      )}
    </form>
  );
}
