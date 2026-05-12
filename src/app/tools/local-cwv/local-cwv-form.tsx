"use client";

import { useActionState } from "react";
import { Gauge, Loader2 } from "lucide-react";
import { runLocalCwv, type LocalCwvState } from "./actions";

export function LocalCwvForm() {
  const [state, formAction, pending] = useActionState<
    LocalCwvState | null,
    FormData
  >(runLocalCwv, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_120px]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">URL</span>
            <input
              name="url"
              required
              placeholder="https://example.com/landing"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Device</span>
            <select
              name="device"
              defaultValue="mobile"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
          </label>
          <label
            className="space-y-1 text-xs"
            title="PSI = Google's PageSpeed Insights API (free, fast, no browser). Local = headless Chrome on this server (full control, console errors, slower)."
          >
            <span className="text-muted-foreground">Mode</span>
            <select
              name="mode"
              defaultValue="psi"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="psi">PSI API</option>
              <option value="local">Local browser</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-amber-500/15 px-4 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Measuring…
              </>
            ) : (
              <>
                <Gauge className="mr-2 size-3" />
                Run
              </>
            )}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && <ResultView result={state.result} />}
    </>
  );
}

function ResultView({
  result,
}: {
  result: NonNullable<Extract<LocalCwvState, { ok: true }>["result"]>;
}) {
  const score = result.performanceScore;
  const scoreTone =
    score === null
      ? "text-muted-foreground"
      : score >= 90
        ? "text-emerald-300"
        : score >= 50
          ? "text-amber-300"
          : "text-rose-300";

  const verdictTone: Record<string, string> = {
    good: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    "needs-improvement": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    poor: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    unknown: "bg-white/5 text-muted-foreground ring-white/10",
  };

  return (
    <>
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Performance score</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lighthouse-mobile-equivalent (LCP 25% · TBT 30% · CLS 25% · FCP
              10% · others 10%)
            </p>
          </div>
          <div className={`text-5xl font-bold tabular-nums ${scoreTone}`}>
            {score ?? "—"}
            <span className="text-base text-muted-foreground/60">/100</span>
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full rounded-full ${
              score === null
                ? "bg-white/5"
                : score >= 90
                  ? "bg-emerald-400/70"
                  : score >= 50
                    ? "bg-amber-400/70"
                    : "bg-rose-400/70"
            }`}
            style={{ width: `${score ?? 0}%` }}
          />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Metric
          label="LCP"
          value={result.lcpMs !== null ? `${(result.lcpMs / 1000).toFixed(2)}s` : "—"}
          target="≤2.5s"
          verdictTone={verdictTone[result.verdict.lcp]}
          verdictLabel={result.verdict.lcp}
          extra={result.lcpElement ? `<${result.lcpElement}>` : null}
        />
        <Metric
          label="FCP"
          value={result.fcpMs !== null ? `${(result.fcpMs / 1000).toFixed(2)}s` : "—"}
          target="≤1.8s"
          verdictTone={verdictTone[result.verdict.fcp]}
          verdictLabel={result.verdict.fcp}
        />
        <Metric
          label="CLS"
          value={result.cls !== null ? result.cls.toFixed(3) : "—"}
          target="≤0.1"
          verdictTone={verdictTone[result.verdict.cls]}
          verdictLabel={result.verdict.cls}
        />
        <Metric
          label="TBT"
          value={result.tbtMs !== null ? `${result.tbtMs}ms` : "—"}
          target="≤200ms"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="TTFB"
          value={result.ttfbMs !== null ? `${result.ttfbMs}ms` : "—"}
          target="≤600ms"
        />
        <Metric
          label="DCL"
          value={
            result.domContentLoadedMs !== null
              ? `${(result.domContentLoadedMs / 1000).toFixed(2)}s`
              : "—"
          }
          target=""
        />
        <Metric
          label="Load"
          value={result.loadMs !== null ? `${(result.loadMs / 1000).toFixed(2)}s` : "—"}
          target=""
        />
      </div>

      {Object.keys(result.resources.byType).length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold">
            Resource breakdown ({result.resources.count} requests ·{" "}
            {(result.resources.bytes / 1024).toFixed(0)}KB total)
          </h3>
          <div className="grid gap-2 text-xs sm:grid-cols-2 md:grid-cols-4">
            {Object.entries(result.resources.byType)
              .sort((a, b) => b[1].bytes - a[1].bytes)
              .map(([kind, v]) => (
                <div
                  key={kind}
                  className="rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-inset ring-white/5"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {kind}
                  </div>
                  <div className="mt-0.5 text-sm font-medium">
                    {(v.bytes / 1024).toFixed(0)} KB
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {v.count} request{v.count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {result.fixes.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
          <h3 className="text-sm font-semibold">Top fixes (by impact)</h3>
          <ul className="space-y-1.5 text-sm">
            {result.fixes.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(result.consoleErrors > 0 || result.networkErrors.length > 0) && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
          <h3 className="text-sm font-semibold">Runtime issues</h3>
          {result.consoleErrors > 0 && (
            <p className="text-xs text-rose-300">
              {result.consoleErrors} console error
              {result.consoleErrors === 1 ? "" : "s"} during page load
            </p>
          )}
          {result.networkErrors.length > 0 && (
            <ul className="space-y-1 text-xs">
              {result.networkErrors.slice(0, 8).map((e, i) => (
                <li key={i} className="text-rose-300/90">
                  ✗ {e.url.slice(0, 100)} — {e.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  target,
  verdictTone,
  verdictLabel,
  extra,
}: {
  label: string;
  value: string;
  target: string;
  verdictTone?: string;
  verdictLabel?: string;
  extra?: string | null;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {verdictLabel && verdictTone && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ring-1 ring-inset ${verdictTone}`}
          >
            {verdictLabel}
          </span>
        )}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {target && (
        <div className="text-[10px] text-muted-foreground">target {target}</div>
      )}
      {extra && (
        <div className="text-[10px] text-muted-foreground/80">{extra}</div>
      )}
    </div>
  );
}
