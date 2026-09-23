"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { runCruxHistory, type CruxHistoryState } from "./actions";
import { ratingForMetric, type CwvKind } from "@/lib/crux-thresholds";

const METRICS: { kind: CwvKind; label: string; format: (v: number) => string }[] = [
  { kind: "lcp", label: "LCP", format: (v) => `${(v / 1000).toFixed(2)}s` },
  { kind: "inp", label: "INP", format: (v) => `${Math.round(v)}ms` },
  { kind: "cls", label: "CLS", format: (v) => v.toFixed(2) },
  { kind: "fcp", label: "FCP", format: (v) => `${(v / 1000).toFixed(2)}s` },
  { kind: "ttfb", label: "TTFB", format: (v) => `${(v / 1000).toFixed(2)}s` },
];

const RATING_TONE: Record<string, string> = {
  good: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  needs_improvement: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  poor: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export function CruxHistoryPanel() {
  const [state, formAction, pending] = useActionState<CruxHistoryState, FormData>(
    runCruxHistory,
    null,
  );

  return (
    <section className="space-y-3">
      <form action={formAction} className="glass-apple relative space-y-3 overflow-hidden rounded-2xl p-5">
        <div>
          <h2 className="text-base font-semibold">Trend over the last six months</h2>
          <p className="text-[11px] text-muted-foreground">
            CrUX History: one 28-day window per week. Neighbouring windows share
            three weeks, so the latest is compared with the window four weeks
            earlier — the nearest one with no days in common.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">URL</span>
            <input
              name="url"
              required
              placeholder="https://example.com/"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Form factor</span>
            <select
              name="formFactor"
              defaultValue="PHONE"
              className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="PHONE">Phone</option>
              <option value="DESKTOP">Desktop</option>
              <option value="ALL_FORM_FACTORS">All</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center self-end rounded-md bg-emerald-500/15 px-4 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3 animate-spin" /> : "Show trend"}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state && state.ok && !state.hasData && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-inset ring-amber-500/30">
          No CrUX history for this URL or its origin — too little Chrome traffic.
        </p>
      )}

      {state && state.ok && state.hasData && (
        <>
          <p className="text-xs text-muted-foreground">
            {state.scope === "url" ? "URL-level" : "Origin-level"} · {state.formFactor} ·{" "}
            {state.periods.length} weekly windows
            {state.periods.length > 0 &&
              `, ${state.periods[0].start} → ${state.periods[state.periods.length - 1].end}`}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {METRICS.map(({ kind, label, format }) => {
              const series = state.metrics[kind]?.p75s;
              const trend = state.trends[kind];
              if (!series || !trend) return null;
              return (
                <div key={kind} className="glass-apple relative overflow-hidden rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{label}</h3>
                    {trend.latest !== null && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${RATING_TONE[ratingForMetric(kind, trend.latest)]}`}
                      >
                        p75 {format(trend.latest)}
                      </span>
                    )}
                  </div>
                  <Sparkline values={series} />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {trend.latest === null
                      ? "Not enough data in the latest window."
                      : trend.earlier === null
                        ? "No window four weeks earlier to compare with."
                        : `Four weeks earlier: ${format(trend.earlier)}${
                            trend.changePct !== null
                              ? ` (${trend.changePct > 0 ? "+" : ""}${trend.changePct}%)`
                              : ""
                          }`}
                  </p>
                  {trend.regressed && (
                    <p className="mt-1 text-[11px] font-medium text-rose-300">
                      More than 20% worse than four weeks earlier.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/** p75 over time; a gap where a window had too little data. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const range = max - min || 1;
  const w = 160;
  const h = 32;
  const step = w / Math.max(values.length - 1, 1);
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    const x = i * step;
    const y = h - ((v - min) / range) * h;
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    pen = true;
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-3 h-8 w-full text-emerald-300"
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
