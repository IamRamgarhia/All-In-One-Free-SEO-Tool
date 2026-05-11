"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { checkSlop, type AiSlopState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";
import { SLOP_PATTERNS } from "@/lib/ai-slop-patterns";

export default function AiSlopPage() {
  const [state, formAction, pending] = useActionState<AiSlopState, FormData>(
    checkSlop,
    null,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (state?.ok) setRefreshKey((k) => k + 1);
  }, [state]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="AI slop detector (24 patterns)"
        description="Score any content for the 24 telltale AI writing patterns — significance inflation, negative parallelism, banned vocab, em-dash overuse, sycophancy, and more. 90+ ships, <50 needs a full rewrite. Runs locally — no AI call, no token cost."
        icon={Sparkles}
        accent="amber"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            Paste content (markdown or plain text)
          </span>
          <textarea
            name="text"
            required
            rows={14}
            placeholder="Paste your blog post, landing-page copy, or LinkedIn draft here…"
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-amber-500/15 px-5 text-sm font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Scoring…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-4" />
              Detect AI slop
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Based on the open-source x-longform-post humanizer checklist —
          24 patterns, weighted deductions, scoring thresholds.
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <section
            className={`rounded-2xl border p-6 ${
              state.report.score >= 90
                ? "border-emerald-500/30 bg-emerald-500/5"
                : state.report.score >= 70
                  ? "border-amber-500/30 bg-amber-500/5"
                  : state.report.score >= 50
                    ? "border-orange-500/30 bg-orange-500/5"
                    : "border-rose-500/30 bg-rose-500/5"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {state.report.wordCount} words ·{" "}
                  {state.report.patternsTriggered} of 24 patterns triggered ·{" "}
                  -{state.report.totalDeductions} pts
                </p>
                <h2 className="text-base font-semibold">
                  {state.report.verdictLabel}
                </h2>
              </div>
              <div
                className={`text-5xl font-bold tabular-nums ${
                  state.report.score >= 90
                    ? "text-emerald-300"
                    : state.report.score >= 70
                      ? "text-amber-300"
                      : state.report.score >= 50
                        ? "text-orange-300"
                        : "text-rose-300"
                }`}
              >
                {state.report.score}
                <span className="text-base text-muted-foreground">/100</span>
              </div>
            </div>
          </section>

          {state.report.violations.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">
                  Violations ({state.report.violations.length})
                </h3>
              </header>
              <ul className="divide-y divide-white/[0.06]">
                {state.report.violations.map((v, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 px-5 py-3 text-sm"
                  >
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-mono text-rose-300 ring-1 ring-inset ring-rose-500/30">
                      <AlertTriangle className="size-3" />
                      -{v.deduction}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-medium">
                        #{v.patternId} · {v.patternName}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {v.excerpt}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h3 className="text-sm font-semibold">All 24 patterns tracked</h3>
            <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
              {SLOP_PATTERNS.map((p) => {
                const hit = state.report.violations.some(
                  (v) => v.patternId === p.id,
                );
                return (
                  <div
                    key={p.id}
                    className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 ring-1 ring-inset ${
                      hit
                        ? "bg-rose-500/5 ring-rose-500/20"
                        : "bg-emerald-500/5 ring-emerald-500/20"
                    }`}
                  >
                    {hit ? (
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-rose-400" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        #{p.id} {p.name}{" "}
                        <span className="text-muted-foreground">
                          -{p.deduction}
                        </span>
                      </p>
                      <p className="text-muted-foreground">{p.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <RecentRuns toolId="ai-slop" refreshKey={refreshKey} />
    </div>
  );
}
