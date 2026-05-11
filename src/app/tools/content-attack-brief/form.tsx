"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Target, AlertTriangle } from "lucide-react";
import {
  runContentAttackBrief,
  type ContentAttackBriefState,
} from "./actions";
import { RecentRuns } from "@/components/recent-runs";
import { AiDisclaimer } from "@/components/ai-disclaimer";

type Props = {
  clients: { id: number; name: string; gscProperty: string | null }[];
};

export function ContentAttackBriefForm({ clients }: Props) {
  const [state, formAction, pending] = useActionState<
    ContentAttackBriefState,
    FormData
  >(runContentAttackBrief, null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (state?.ok) setRefreshKey((k) => k + 1);
  }, [state]);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Client</span>
            <select
              name="clientId"
              required
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="">Pick a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.gscProperty}>
                  {c.name} {c.gscProperty ? "" : "(no GSC)"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Look-back (days)</span>
            <select
              name="days"
              defaultValue="28"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="14">14 days</option>
              <option value="28">28 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-emerald-500/15 px-5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Pulling GSC + ranking…
            </>
          ) : (
            <>
              <Target className="mr-2 size-4" />
              Build attack brief
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Impact = log10(impressions) × 1.5 + funnel weight. Confidence =
          inverse of position + CTR-vs-expected. Priority = Impact ×
          Confidence (max 100).
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <p className="text-xs text-muted-foreground">
              {state.clientName} · {state.totalCandidates} candidates ·{" "}
              {state.lookbackDays}-day look-back
            </p>
            <h2 className="text-base font-semibold">
              Top {state.targets.length} attack targets
            </h2>
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h3 className="text-sm font-semibold">
                Ranked by priority (Impact × Confidence)
              </h3>
            </header>
            <ul className="divide-y divide-white/[0.06]">
              {state.targets.map((t, i) => {
                const brief = state.briefs.find((b) => b.query === t.query);
                return (
                  <li key={i} className="px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{i + 1}
                          </span>
                          <p className="font-medium">{t.query}</p>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${
                              t.funnel === "BOFU"
                                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                                : t.funnel === "MOFU"
                                  ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                                  : "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                            }`}
                          >
                            {t.funnel}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span>pos {t.position.toFixed(1)}</span>
                          <span>· {t.impressions.toLocaleString()} impr</span>
                          <span>· {t.clicks} clicks</span>
                          <span>· {(t.ctr * 100).toFixed(1)}% CTR</span>
                          <span>· Impact {t.impact}</span>
                          <span>· Conf {t.confidence}</span>
                        </div>
                        {t.reasoning.length > 0 && (
                          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                            {t.reasoning.map((r, j) => (
                              <li key={j} className="flex items-start gap-1.5">
                                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
                                <span>{r}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {brief && (
                          <div className="mt-2 rounded-md bg-emerald-500/5 p-2 ring-1 ring-inset ring-emerald-500/20">
                            <p className="text-[10px] uppercase tracking-wider text-emerald-300">
                              Attack angle · {brief.contentType}
                            </p>
                            <p className="mt-1">{brief.angle}</p>
                            {brief.internalLinks.length > 0 && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Internal-link from:{" "}
                                {brief.internalLinks.join(", ")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-2xl font-bold tabular-nums text-emerald-300">
                          {t.priority}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          priority
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {state.briefs.length === 0 && (
            <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-inset ring-amber-500/30">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Targets ranked, but no AI is configured. Add an AI provider in
                Settings → AI to get specific attack angles for the top 10.
              </span>
            </p>
          )}

          <AiDisclaimer variant="inline" />
        </>
      )}

      <RecentRuns toolId="content-attack-brief" refreshKey={refreshKey} />
    </>
  );
}
