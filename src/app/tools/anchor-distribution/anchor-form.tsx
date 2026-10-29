"use client";

import { useActionState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { runAnchor, type AnchorState } from "./actions";

export function AnchorForm() {
  const [state, formAction, pending] = useActionState<
    AnchorState | null,
    FormData
  >(runAnchor, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <input
          name="url"
          required
          placeholder="https://yoursite.com/page"
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Brand terms (comma-separated)</span>
            <input
              name="brandTerms"
              placeholder="e.g. dice codes, dicecodes, dicecodes seo"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Exact-match target keywords (comma-separated)</span>
            <input
              name="exactMatchTerms"
              placeholder="e.g. seo software, ranking tool"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Link2 className="mr-2 size-4" />
              Analyze
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
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Total anchors" value={state.result.totalAnchors.toString()} />
            <Stat label="Internal" value={state.result.internal.length.toString()} />
            <Stat label="External" value={state.result.external.length.toString()} />
            <Stat
              label="Exact-match %"
              value={`${state.result.exactMatchPct.toFixed(1)}%`}
              tone={state.result.exactMatchPct > 5 ? "rose" : "emerald"}
              hint={`branded ${state.result.brandedPct.toFixed(1)}%`}
            />
          </div>

          {state.result.warnings.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold">Warnings</h3>
              <ul className="space-y-1 text-xs">
                {state.result.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300 ring-1 ring-inset ring-amber-500/30"
                  >
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold">Top anchor phrases</h3>
            <div className="flex flex-wrap gap-1.5">
              {state.result.topAnchorTerms.map((t) => (
                <span
                  key={t.term}
                  className="rounded-md bg-white/5 px-2 py-0.5 text-xs ring-1 ring-inset ring-white/10"
                >
                  {t.term} <span className="text-muted-foreground">×{t.count}</span>
                </span>
              ))}
            </div>
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h3 className="text-sm font-semibold">Internal anchors</h3>
            </header>
            <ul className="divide-y divide-white/[0.05]">
              {state.result.internal.slice(0, 30).map((a, i) => (
                <li key={i} className="grid grid-cols-[1fr_2fr_auto] gap-3 px-5 py-1.5 text-xs">
                  <span className="truncate">{a.anchor}</span>
                  <code className="truncate text-muted-foreground">{a.href}</code>
                  <span className="text-muted-foreground tabular-nums">×{a.count}</span>
                </li>
              ))}
            </ul>
          </section>

          {state.result.external.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">External anchors</h3>
              </header>
              <ul className="divide-y divide-white/[0.05]">
                {state.result.external.slice(0, 30).map((a, i) => (
                  <li key={i} className="grid grid-cols-[1fr_2fr_auto] gap-3 px-5 py-1.5 text-xs">
                    <span className="truncate">{a.anchor}</span>
                    <code className="truncate text-muted-foreground">{a.href}</code>
                    <span className="text-muted-foreground tabular-nums">×{a.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "emerald" | "amber" | "rose";
}) {
  const t = tone ? { emerald: "text-emerald-300", amber: "text-amber-300", rose: "text-rose-300" }[tone] : "";
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
