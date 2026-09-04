"use client";

import { useActionState, useState } from "react";
import { usePresetUrl } from "@/components/use-preset-url";
import { Camera, Loader2 } from "lucide-react";
import { runRender, type RenderState } from "./actions";

export function RenderForm() {
  // Prefilled when opened from a client, so the domain is not retyped.
  const presetUrl = usePresetUrl();
  const [state, formAction, pending] = useActionState<
    RenderState | null,
    FormData
  >(runRender, null);
  const [tab, setTab] = useState<"screenshot" | "html" | "headers" | "console">(
    "screenshot",
  );

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">URL</span>
            <input
              name="url"
              defaultValue={presetUrl}
              required
              placeholder="https://example.com"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Device</span>
              <select
                name="device"
                defaultValue="desktop"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-2 text-sm"
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Wait</span>
              <select
                name="waitUntil"
                defaultValue="load"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-2 text-sm"
              >
                <option value="domcontentloaded">DOM</option>
                <option value="load">Load</option>
                <option value="networkidle">Idle</option>
              </select>
            </label>
            <label className="flex items-end space-y-1 text-xs">
              <input
                type="checkbox"
                name="fullPage"
                defaultChecked
                className="mr-2 size-4"
              />
              <span>Full page</span>
            </label>
          </div>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-cyan-500/15 px-5 text-sm font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Rendering in Chrome…
            </>
          ) : (
            <>
              <Camera className="mr-2 size-4" />
              Capture
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">
                  {state.result.page.title ?? "(no title)"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {state.result.finalUrl ?? state.result.url}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <Tag>
                  status{" "}
                  <span
                    className={
                      state.result.status && state.result.status < 400
                        ? "text-emerald-300"
                        : "text-rose-300"
                    }
                  >
                    {state.result.status ?? "—"}
                  </span>
                </Tag>
                <Tag>
                  load {state.result.loadMs ?? "—"}
                  ms
                </Tag>
                <Tag>links {state.result.page.linkCount}</Tag>
                <Tag>imgs {state.result.page.imageCount}</Tag>
                <Tag>scripts {state.result.page.scriptCount}</Tag>
                {state.result.consoleErrors.length > 0 && (
                  <Tag tone="rose">
                    {state.result.consoleErrors.length} console err
                  </Tag>
                )}
                {state.result.networkErrors.length > 0 && (
                  <Tag tone="rose">
                    {state.result.networkErrors.length} net err
                  </Tag>
                )}
              </div>
            </div>

            {state.result.redirects.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Redirect chain ({state.result.redirects.length}):{" "}
                {state.result.redirects.map((r, i) => (
                  <span key={i}>
                    <code className="rounded bg-white/5 px-1.5 py-0.5">
                      {r.status}
                    </code>{" "}
                    {i < state.result.redirects.length - 1 && "→ "}
                  </span>
                ))}
              </div>
            )}

            {state.result.page.schemaTypes.length > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Schema: </span>
                {state.result.page.schemaTypes.map((t) => (
                  <span
                    key={t}
                    className="ml-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-violet-200 ring-1 ring-inset ring-violet-500/30"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-white/[0.06]">
            {(["screenshot", "html", "headers", "console"] as const).map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    tab === t
                      ? "border-cyan-400 text-cyan-300"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ),
            )}
          </div>

          {tab === "screenshot" && state.result.screenshot && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.result.screenshot}
                alt="rendered page"
                className="w-full rounded-lg ring-1 ring-inset ring-white/5"
              />
            </section>
          )}
          {tab === "screenshot" && !state.result.screenshot && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 text-sm text-muted-foreground">
              No screenshot captured.
            </section>
          )}

          {tab === "html" && state.result.html && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-3">
              <pre className="max-h-[600px] overflow-auto rounded-md bg-black/40 p-3 text-[11px] leading-relaxed">
                {state.result.html.slice(0, 200_000)}
              </pre>
            </section>
          )}

          {tab === "headers" && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
              <h3 className="mb-3 text-sm font-semibold">Response headers</h3>
              <div className="space-y-1 text-xs">
                {Object.entries(state.result.responseHeaders).map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[180px_1fr] gap-3 border-b border-white/5 py-1"
                  >
                    <span className="text-muted-foreground">{k}</span>
                    <span className="break-all font-mono">{v}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === "console" && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
              {state.result.consoleErrors.length === 0 &&
              state.result.consoleWarnings.length === 0 &&
              state.result.networkErrors.length === 0 ? (
                <p className="text-sm text-emerald-300">
                  No console / network issues during page load. ✓
                </p>
              ) : (
                <>
                  {state.result.consoleErrors.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-rose-300">
                        Console errors ({state.result.consoleErrors.length})
                      </h3>
                      <ul className="space-y-1 text-xs">
                        {state.result.consoleErrors.map((c, i) => (
                          <li
                            key={i}
                            className="rounded-md bg-rose-500/5 p-2 ring-1 ring-inset ring-rose-500/20"
                          >
                            {c.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {state.result.consoleWarnings.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-amber-300">
                        Console warnings (
                        {state.result.consoleWarnings.length})
                      </h3>
                      <ul className="space-y-1 text-xs">
                        {state.result.consoleWarnings.slice(0, 10).map((c, i) => (
                          <li
                            key={i}
                            className="rounded-md bg-amber-500/5 p-2 ring-1 ring-inset ring-amber-500/20"
                          >
                            {c.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {state.result.networkErrors.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-rose-300">
                        Network failures ({state.result.networkErrors.length})
                      </h3>
                      <ul className="space-y-1 text-xs">
                        {state.result.networkErrors.map((e, i) => (
                          <li
                            key={i}
                            className="rounded-md bg-rose-500/5 p-2 ring-1 ring-inset ring-rose-500/20"
                          >
                            ✗ <span className="break-all">{e.url}</span> —{" "}
                            {e.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}

function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "rose";
}) {
  const t =
    tone === "rose"
      ? "bg-rose-500/10 text-rose-300 ring-rose-500/30"
      : "bg-white/5 text-muted-foreground ring-white/10";
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 ring-1 ring-inset ${t}`}
    >
      {children}
    </span>
  );
}
