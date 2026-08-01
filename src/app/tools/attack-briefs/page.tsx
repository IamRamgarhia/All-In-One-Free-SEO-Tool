"use client";

import { useActionState, useEffect, useState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import { Loader2, Target } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { generateAttackBriefs, type AttackState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";
import { AiDisclaimer } from "@/components/ai-disclaimer";

export default function AttackBriefsPage() {
  const [state, formAction, pending] = useActionState<AttackState, FormData>(
    generateAttackBriefs,
    null,
  );
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Content Attack Briefs"
        description="Up to 5 keyword-gap content briefs targeting specific competitor weaknesses. Each brief includes vulnerability scoring, required E-E-A-T signals, schema, internal-link targets, and AIO passage hints."
        icon={Target}
        accent="rose"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            Target keywords (one per line, max 5)
          </span>
          <textarea
            name="keywords"
            required
            rows={5}
            placeholder={`best react seo tools\nnext.js technical seo\nshopify seo checklist`}
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 font-mono text-sm"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">
              Competitor domain (optional — boosts vulnerability scoring)
            </span>
            <input
              name="competitor"
              placeholder="competitor.com"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Country</span>
            <input
              name="country"
              defaultValue="US"
              maxLength={4}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm uppercase"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-rose-500/15 px-5 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Building briefs… (1-2 min)
            </>
          ) : (
            <>
              <Target className="mr-2 size-4" />
              Generate attack briefs
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
        <div className="space-y-4">
          {state.briefs.map((b, i) => (
            <section
              key={i}
              className="glass-apple relative overflow-hidden rounded-2xl"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">{b.targetKeyword}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-300 ring-1 ring-inset ring-violet-500/30">
                      {b.searchIntent}
                    </span>
                    <span className="text-muted-foreground">
                      SERP median: ~{b.serpMedianWordCount} words · target: ~
                      {b.recommendedWordCount}
                    </span>
                  </div>
                </div>
                <div
                  className={`text-2xl font-bold tabular-nums ${
                    b.vulnerabilityScore >= 70
                      ? "text-emerald-300"
                      : b.vulnerabilityScore >= 40
                        ? "text-amber-300"
                        : "text-rose-300"
                  }`}
                >
                  {b.vulnerabilityScore}
                  <span className="text-xs text-muted-foreground">
                    /100 vuln
                  </span>
                </div>
              </header>
              <div className="space-y-4 p-5 text-sm">
                <p className="text-xs text-muted-foreground italic">
                  {b.competitorWeakness}
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field title="Required E-E-A-T signals" items={b.requiredEeat} />
                  <Field title="Required schema" items={b.requiredSchema} />
                  <Field title="Internal-link targets" items={b.internalLinkTargets} />
                  <Field title="AIO passage hints" items={b.aioPassageHints} />
                </div>

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    SERP top 10
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {b.topCompetitors.map((c) => (
                      <li key={c.position}>
                        <strong>#{c.position}</strong> {c.domain} — {c.title}
                      </li>
                    ))}
                  </ul>
                </details>

                {b.paaQuestions.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      People Also Ask
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {b.paaQuestions.map((q, j) => (
                        <li key={j}>· {q}</li>
                      ))}
                    </ul>
                  </details>
                )}

                <p className="rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs">
                  <strong className="text-violet-200">Definition of done: </strong>
                  {b.definitionOfDone}
                </p>
                <AiDisclaimer variant="inline" />
              </div>
            </section>
          ))}
        </div>
      )}

      <RecentRuns toolId="attack-briefs" refreshKey={refreshKey} />
    </div>
  );
}

function Field({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md bg-black/20 p-3 text-xs">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-rose-400" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
