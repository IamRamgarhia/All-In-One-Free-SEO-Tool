"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { runExpertPanel, type ExpertPanelState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";
import { AiDisclaimer } from "@/components/ai-disclaimer";

export default function ExpertPanelPage() {
  const [state, formAction, pending] = useActionState<ExpertPanelState, FormData>(
    runExpertPanel,
    null,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (state?.ok) setRefreshKey((k) => k + 1);
  }, [state]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Expert panel content scorer"
        description="Auto-assembles a panel of 6-9 domain experts (incl. AI Writing Detector + Brand Voice Match) and scores your draft. Target 90/100. Outputs the top 3 fixes and each expert's specific revisions. Mirrors the open-source content-ops expert-panel methodology."
        icon={Users}
        accent="violet"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Content type</span>
            <select
              name="contentType"
              defaultValue="blog"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="blog">Blog post</option>
              <option value="linkedin">LinkedIn post</option>
              <option value="landing">Landing page</option>
              <option value="x">X / Twitter</option>
              <option value="email">Email</option>
              <option value="strategy">Strategy doc</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Industry</span>
            <select
              name="industry"
              defaultValue="general"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="general">General</option>
              <option value="saas">SaaS / B2B</option>
              <option value="ecommerce">E-commerce</option>
              <option value="local">Local business</option>
              <option value="agency">Agency / services</option>
              <option value="creator">Creator economy</option>
            </select>
          </label>
        </div>

        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Content to score</span>
          <textarea
            name="text"
            required
            rows={12}
            placeholder="Paste your draft here — the panel will critique it from each expert's angle…"
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Assembling panel…
            </>
          ) : (
            <>
              <Users className="mr-2 size-4" />
              Score with expert panel
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Uses your configured AI provider. AI Writing Detector and Brand
          Voice Match are always in the panel.
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && state.rounds.length > 0 && (() => {
        const final = state.rounds[state.rounds.length - 1];
        const accentClass = state.shipped
          ? "border-emerald-500/30 bg-emerald-500/5"
          : final.aggregateScore >= 70
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-rose-500/30 bg-rose-500/5";
        const scoreClass = state.shipped
          ? "text-emerald-300"
          : final.aggregateScore >= 70
            ? "text-amber-300"
            : "text-rose-300";
        return (
          <>
            <section className={`rounded-2xl border p-6 ${accentClass}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {state.panel.length} experts · {state.contentType} ·{" "}
                    {state.industry}
                  </p>
                  <h2 className="text-base font-semibold">
                    {state.shipped
                      ? "Ship it — panel approves."
                      : final.aggregateScore >= 70
                        ? "Close — refine the top 3 fixes."
                        : "Significant rewrite needed."}
                  </h2>
                </div>
                <div className={`text-5xl font-bold tabular-nums ${scoreClass}`}>
                  {final.aggregateScore}
                  <span className="text-base text-muted-foreground">/100</span>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Local AI-slop score (deterministic, pre-AI)
                </p>
                <p className="text-sm">
                  {final.slop.score}/100 — {final.slop.violations.length} pattern
                  violations
                </p>
              </div>
            </section>

            <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
              <h3 className="text-sm font-semibold">Top 3 fixes (priority)</h3>
              <ol className="mt-2 space-y-1.5 text-sm">
                {final.topThreeFixes.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[10px] font-bold text-violet-300 ring-1 ring-inset ring-violet-500/30">
                      {i + 1}
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">Expert scores</h3>
              </header>
              <ul className="divide-y divide-white/[0.06]">
                {final.experts.map((e, i) => (
                  <li key={i} className="px-5 py-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{e.name}</p>
                      <span
                        className={`text-lg font-bold tabular-nums ${
                          e.score >= 90
                            ? "text-emerald-300"
                            : e.score >= 70
                              ? "text-amber-300"
                              : "text-rose-300"
                        }`}
                      >
                        {e.score}
                      </span>
                    </div>
                    {e.topThreeWeaknesses.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Weaknesses
                        </p>
                        <ul className="space-y-0.5 text-xs">
                          {e.topThreeWeaknesses.map((w, j) => (
                            <li key={j} className="flex items-start gap-1.5">
                              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" />
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {e.specificRevisions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Specific revisions
                        </p>
                        <ul className="space-y-0.5 text-xs">
                          {e.specificRevisions.map((r, j) => (
                            <li key={j} className="flex items-start gap-1.5">
                              <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <AiDisclaimer variant="inline" />
          </>
        );
      })()}

      <RecentRuns toolId="expert-panel" refreshKey={refreshKey} />
    </div>
  );
}
