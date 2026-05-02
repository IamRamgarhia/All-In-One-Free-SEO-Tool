"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  Globe,
  Info,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { gradeSite, type GraderResult } from "./actions";

const sevConfig: Record<
  "critical" | "high" | "medium" | "low",
  { icon: typeof AlertCircle; pill: string }
> = {
  critical: {
    icon: AlertCircle,
    pill: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  },
  high: {
    icon: AlertTriangle,
    pill: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  },
  medium: {
    icon: AlertTriangle,
    pill: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
  low: {
    icon: Info,
    pill: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  },
};

export function GraderForm() {
  const [state, formAction, pending] = useActionState<
    GraderResult | null,
    FormData
  >(gradeSite, null);

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md"
      >
        <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-violet-500/25 blur-[100px]" />
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-72 rounded-full bg-cyan-500/20 blur-[100px]" />
        <div className="relative flex flex-col gap-3 p-5 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="url"
              placeholder="acmecoffee.com"
              required
              className="h-12 pl-10 text-base"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="h-12 px-6 shadow-lg shadow-violet-500/30 ring-1 ring-inset ring-white/15"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Auditing…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Grade my site
              </>
            )}
          </Button>
        </div>
        <p className="relative px-5 pb-5 text-xs text-muted-foreground">
          Free. Takes ~10 seconds. No signup, no API key. We&apos;ll fetch your
          homepage, run 12 on-page checks plus 7 site-wide checks, and return a
          health score with the top issues.
        </p>
      </form>

      {state && !state.ok && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          {state.error}
        </div>
      )}

      {state?.ok && <ResultsPanel result={state} />}
    </div>
  );
}

function ResultsPanel({
  result,
}: {
  result: Extract<GraderResult, { ok: true }>;
}) {
  const headline =
    result.score >= 80
      ? "Solid foundations — let's get you to 95+"
      : result.score >= 50
        ? "There's clear room to improve"
        : "Plenty of room to improve — but everything we found is fixable";

  return (
    <section className="space-y-6">
      {/* Score hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-12 -top-12 size-72 rounded-full bg-violet-500/20 blur-[100px]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-[auto_1fr] lg:items-center">
          <ScoreGauge score={result.score} size={156} />
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              <span className="text-gradient-brand">{headline}</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              Audited{" "}
              <a
                href={result.finalUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                {result.finalUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>{" "}
              · {result.pagesCrawled} page{result.pagesCrawled === 1 ? "" : "s"}{" "}
              checked
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Pill tone="rose" count={result.counts.critical} label="critical" />
              <Pill tone="rose" count={result.counts.high} label="high" />
              <Pill tone="amber" count={result.counts.medium} label="medium" />
              <Pill tone="cyan" count={result.counts.low} label="low" />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <a
                href={`/grader/pdf?url=${encodeURIComponent(result.url)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-violet-500/30 ring-1 ring-inset ring-white/15 transition-colors hover:bg-primary/90"
              >
                <Download className="size-4" />
                Download PDF report
              </a>
              <Link
                href={`/clients/new?url=${encodeURIComponent(result.url)}`}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                <CheckCircle2 className="size-4" />
                Save as a tracked client
              </Link>
              <Link
                href="/grader"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                Audit another site
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Top findings */}
      {result.topFindings.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <header className="border-b border-white/5 px-5 py-4">
            <h3 className="text-base font-semibold">Top issues to fix</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sorted by severity. Save this site to track over time and unlock
              the full report with auto-generated tasks and PDF export.
            </p>
          </header>
          <ul className="divide-y divide-white/5">
            {result.topFindings.map((f, i) => {
              const cfg = sevConfig[f.severity as keyof typeof sevConfig];
              const Icon = cfg.icon;
              return (
                <li key={i} className="flex items-start gap-3 px-5 py-4">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${cfg.pill}`}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">
                        {f.type.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cfg.pill}`}
                      >
                        {f.severity}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{f.message}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function Pill({
  tone,
  count,
  label,
}: {
  tone: "rose" | "amber" | "cyan";
  count: number;
  label: string;
}) {
  const map = {
    rose: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    cyan: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ring-1 ring-inset ${map[tone]} ${count === 0 ? "opacity-40" : ""}`}
    >
      <span className="font-bold">{count}</span> {label}
    </span>
  );
}
