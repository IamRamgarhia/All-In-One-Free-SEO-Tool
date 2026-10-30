"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { HelpLink } from "@/components/shell/help-link";
import {
  AlertCircle,
  ArrowLeft,
  Gauge,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  estimateDifficulty,
  type DifficultyApiResult,
} from "./actions";

const bandTone: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  moderate: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  hard: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  very_hard: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

const intentTone: Record<string, string> = {
  informational: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  commercial: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  transactional: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  navigational: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
};

export default function KeywordDifficultyPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DifficultyApiResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!query.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await estimateDifficulty(query);
      setResult(r);
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/*
        The back link and the help button share a row.

        These pages hand-roll their header instead of using PageHeader,
        which is where <HelpLink /> normally lives — so 18 of the 92
        tools had no way to reach their documentation at all. The help
        link resolves the current route to that tool's own anchor on the
        reference page.
      */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          All tools
        </Link>
        <HelpLink />
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-400/30">
            <Gauge className="size-5 text-amber-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Keyword difficulty</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Heuristic difficulty score (0-100) computed from real SERP signals —
          no Ahrefs / Semrush key needed. Combines big-brand presence in top 10,
          SERP-feature occupation, title competitiveness, and your AI key (if
          configured) for a plain-language take on how to compete.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <Label htmlFor="kd-query" className="text-sm">
          Keyword
        </Label>
        <div className="mt-2 flex gap-2">
          <Input
            id="kd-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="best espresso machine for beginners"
            className="flex-1"
            disabled={pending}
          />
          <Button onClick={run} disabled={pending || !query.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Scoring…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Estimate
              </>
            )}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Scrapes the live SERP via headless browser. First run can take ~10s.
        </p>
      </section>

      {result && !result.ok && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="mr-2 inline size-4" />
          {result.error}
        </div>
      )}

      {result?.ok && (
        <>
          {/* Headline */}
          <section className="glass-apple relative overflow-hidden rounded-2xl p-6">
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="flex size-32 shrink-0 items-center justify-center rounded-2xl bg-white/[0.02] ring-1 ring-inset ring-white/[0.06]">
                <div className="text-center">
                  <div className="text-4xl font-bold tabular-nums text-gradient-brand">
                    {result.difficulty}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    / 100
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${bandTone[result.difficulty_band]}`}
                  >
                    {result.difficulty_band.replace("_", " ")}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${intentTone[result.intent]}`}
                  >
                    {result.intent} intent
                  </span>
                </div>
                <h2 className="truncate text-xl font-semibold">
                  {result.query}
                </h2>
                {result.summary && (
                  <p className="text-sm text-muted-foreground">
                    {result.summary}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Recommendation */}
          {result.recommendation && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="size-4 text-violet-300" />
                How to compete
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {result.recommendation}
              </p>
            </section>
          )}

          {/* Signal grid */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">Why we scored it that way</h2>
            </header>
            <dl className="grid gap-3 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <SignalItem
                label="Big brands in top 10"
                value={String(result.signals.bigBrandsInTop10)}
                hint={
                  result.signals.bigBrandsInTop10 >= 4
                    ? "Wikipedia / Reddit / Forbes etc — hard to outrank"
                    : "Beatable"
                }
              />
              <SignalItem
                label="Unique domains"
                value={`${result.signals.uniqueDomainsInTop10}/10`}
                hint={
                  result.signals.uniqueDomainsInTop10 >= 9
                    ? "Highly competitive — many sites fighting"
                    : "Some domains have multiple slots"
                }
              />
              <SignalItem
                label="AI Overview"
                value={result.signals.aiOverviewPresent ? "Present" : "Absent"}
                hint={
                  result.signals.aiOverviewPresent
                    ? "Eats clicks above results"
                    : "Free territory above the fold"
                }
              />
              <SignalItem
                label="Featured snippet"
                value={
                  result.signals.featuredSnippetPresent ? "Present" : "Absent"
                }
                hint={
                  result.signals.featuredSnippetPresent
                    ? "Win-win-back if you can answer better"
                    : null
                }
              />
              <SignalItem
                label="Local pack"
                value={result.signals.localPackPresent ? "Present" : "Absent"}
                hint={
                  result.signals.localPackPresent
                    ? "Likely local-intent query"
                    : null
                }
              />
              <SignalItem
                label="People also ask"
                value={`${result.signals.paaCount} questions`}
                hint={
                  result.signals.paaCount > 0
                    ? "Easy subtopic capture"
                    : null
                }
              />
              <SignalItem
                label="Avg title length"
                value={`${result.signals.avgWordsInTitle} words`}
                hint={
                  result.signals.avgWordsInTitle > 9
                    ? "Competitors invest heavily"
                    : "Reasonable competition"
                }
              />
            </dl>
          </section>

          {/* Top 10 */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">Top 10 we analyzed</h2>
            </header>
            <ul className="divide-y divide-white/[0.04]">
              {result.signals.topResults.map((r) => (
                <li key={r.position} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/5 text-xs font-bold tabular-nums ring-1 ring-inset ring-white/10">
                    {r.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {r.domain}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function SignalItem({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string | null;
}) {
  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-semibold">{value}</dd>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
