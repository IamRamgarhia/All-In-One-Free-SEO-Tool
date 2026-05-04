"use client";

import { useActionState } from "react";
import { ExternalLink, Gauge, Loader2 } from "lucide-react";
import { gradeContent, type GradeContentState } from "./actions";

export function GraderForm() {
  const [state, formAction, pending] = useActionState<
    GradeContentState | null,
    FormData
  >(gradeContent, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_120px]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Target keyword</span>
            <input
              name="targetKeyword"
              required
              placeholder="best vegan cookbooks"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Country</span>
            <input
              name="country"
              defaultValue="US"
              maxLength={4}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm uppercase focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">
            Your content (paste markdown or plain text)
          </span>
          <textarea
            name="content"
            required
            rows={14}
            placeholder="# Best Vegan Cookbooks for Beginners\n\nIf you're new to plant-based cooking..."
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-emerald-500/15 px-5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Scoring against the SERP… (1-2 min)
            </>
          ) : (
            <>
              <Gauge className="mr-2 size-4" />
              Grade content
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          We pull the top 10 SERP results, fetch each one&apos;s body text,
          compute TF-IDF, and score your draft against the corpus. Takes
          about 60-90 seconds.
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <ScoreTile
              label="Overall"
              value={state.grade.score}
              max={100}
              tone={
                state.grade.score >= 80
                  ? "emerald"
                  : state.grade.score >= 50
                    ? "amber"
                    : "rose"
              }
              big
            />
            <ScoreTile
              label="Length"
              value={state.grade.breakdown.lengthScore}
              max={30}
            />
            <ScoreTile
              label="Term coverage"
              value={state.grade.breakdown.coverageScore}
              max={50}
            />
            <ScoreTile
              label="Density"
              value={state.grade.breakdown.densityScore}
              max={20}
            />
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-semibold">Recommendations</h2>
            <ul className="space-y-1.5 text-sm">
              {state.grade.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-400" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold">Length</h3>
              <p className="text-2xl font-semibold tabular-nums">
                {state.grade.wordCount}{" "}
                <span className="text-sm text-muted-foreground">words</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                SERP target: {state.grade.targetWordCount.min} ·{" "}
                <strong>{state.grade.targetWordCount.ideal}</strong> ·{" "}
                {state.grade.targetWordCount.max}
              </p>
            </div>
            <div className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold">Keyword density</h3>
              <p className="text-2xl font-semibold tabular-nums">
                {state.grade.keywordDensityPct.toFixed(2)}
                <span className="text-sm text-muted-foreground">%</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Target: {state.grade.targetDensity.min}% ·{" "}
                <strong>{state.grade.targetDensity.ideal}%</strong> ·{" "}
                {state.grade.targetDensity.max}%
              </p>
            </div>
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-semibold">Term coverage</h2>
            <p className="text-[11px] text-muted-foreground">
              Top terms across the SERP corpus. Bold = present in your draft.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {state.insights.topTerms.slice(0, 60).map((t) => {
                const present = state.grade.presentTerms.includes(t.term);
                return (
                  <span
                    key={t.term}
                    className={`rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset ${
                      present
                        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30 font-medium"
                        : "bg-white/5 text-muted-foreground ring-white/10"
                    }`}
                    title={`Appears ${t.corpusFreq} times across the SERP corpus`}
                  >
                    {t.term}
                  </span>
                );
              })}
            </div>
          </section>

          {state.insights.recurringHeadings.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
              <h2 className="text-base font-semibold">Suggested sections</h2>
              <p className="text-[11px] text-muted-foreground">
                Headings used by 2+ top-ranking pages — strong signals of what
                searchers expect.
              </p>
              <ul className="space-y-1 text-sm">
                {state.insights.recurringHeadings.map((h) => (
                  <li key={h.heading} className="flex items-center gap-2">
                    <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-300 ring-1 ring-inset ring-violet-500/30">
                      ×{h.count}
                    </span>
                    <span>{h.heading}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">
                SERP corpus ({state.insights.corpusSize} pages)
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Median {state.insights.medianWordCount} words · avg keyword
                density {state.insights.avgKeywordDensityPct.toFixed(2)}%
              </p>
            </header>
            <ul className="divide-y divide-white/[0.05]">
              {state.insights.sources.map((s) => (
                <li key={s.url} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 flex-1 items-center gap-1 truncate font-medium hover:underline"
                  >
                    {s.title || s.url.replace(/^https?:\/\//, "")}
                    <ExternalLink className="size-3 opacity-60" />
                  </a>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {s.wordCount} words
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

function ScoreTile({
  label,
  value,
  max,
  tone,
  big,
}: {
  label: string;
  value: number;
  max: number;
  tone?: "emerald" | "amber" | "rose";
  big?: boolean;
}) {
  const inferred = (() => {
    if (tone) return tone;
    const ratio = value / max;
    if (ratio >= 0.8) return "emerald";
    if (ratio >= 0.5) return "amber";
    return "rose";
  })();
  const t = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  }[inferred];
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 ${big ? "text-3xl" : "text-2xl"} font-semibold tabular-nums ${t}`}>
        {value}
        <span className="text-sm text-muted-foreground">/{max}</span>
      </div>
    </div>
  );
}
