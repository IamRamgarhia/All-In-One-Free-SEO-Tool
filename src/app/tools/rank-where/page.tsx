"use client";

import { useActionState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import { ExternalLink, Loader2, Target } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { checkRank, type RankWhereState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";

// Quick country picker — most useful for SEO work
const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "IN", name: "India" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "HK", name: "Hong Kong" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "UAE" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "TR", name: "Turkey" },
  { code: "IL", name: "Israel" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "IE", name: "Ireland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "NZ", name: "New Zealand" },
];

export default function RankWherePage() {
  const [state, formAction, pending] = useActionState<RankWhereState, FormData>(
    checkRank,
    null,
  );
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Where do I rank? (country-aware)"
        description="Enter a domain + keyword + country, get your exact position in Google's top 100. See who outranks you, whether AI Overview is present, and get specific fixes to climb."
        icon={Target}
        accent="emerald"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Domain</span>
            <input
              name="domain"
              required
              placeholder="yoursite.com"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Keyword</span>
            <input
              name="query"
              required
              placeholder="best running shoes"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Country</span>
            <select
              name="country"
              defaultValue="US"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Scan depth</span>
            <select
              name="topN"
              defaultValue="100"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="10">Top 10 (fast)</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="100">Top 100 (slow)</option>
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
              Scanning Google…
            </>
          ) : (
            <>
              <Target className="mr-2 size-4" />
              Find my rank
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Uses the shared headless-browser pool with stealth + proxy
          rotation. One scan per minute is fine; rapid repeats may trip
          Google&apos;s rate limiter.
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
              state.result.position === null
                ? "border-rose-500/30 bg-rose-500/5"
                : state.result.position <= 3
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : state.result.position <= 10
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-violet-500/30 bg-violet-500/5"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {state.result.domain} · &quot;{state.result.query}&quot; in{" "}
                  {state.result.country}
                </p>
                <h2 className="text-base font-semibold">
                  {state.result.position === null ? (
                    <>Not found in top {state.result.topN}</>
                  ) : (
                    <>
                      Ranked at <strong>#{state.result.position}</strong>
                    </>
                  )}
                </h2>
                {state.result.rankingUrl && (
                  <a
                    href={state.result.rankingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
                  >
                    {state.result.rankingUrl.replace(/^https?:\/\//, "")}
                    <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>
              <div
                className={`text-4xl font-bold tabular-nums ${
                  state.result.position === null
                    ? "text-rose-300"
                    : state.result.position <= 3
                      ? "text-emerald-300"
                      : state.result.position <= 10
                        ? "text-amber-300"
                        : "text-violet-300"
                }`}
              >
                {state.result.position === null
                  ? "—"
                  : `#${state.result.position}`}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              {state.result.aiOverviewPresent && (
                <span
                  className={`rounded-md px-2 py-0.5 ring-1 ring-inset ${
                    state.result.citedInAiOverview
                      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                      : "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                  }`}
                >
                  AI Overview{" "}
                  {state.result.citedInAiOverview ? "(you're cited ✓)" : "(not cited)"}
                </span>
              )}
              {state.result.featuredSnippet && (
                <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-violet-300 ring-1 ring-inset ring-violet-500/30">
                  Featured snippet: {state.result.featuredSnippet.domain}
                </span>
              )}
            </div>
          </section>

          {state.result.outrankTargets.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">
                  {state.result.position === null
                    ? "Top 3 competitors to study"
                    : "Outrank these next"}
                </h3>
              </header>
              <ul className="divide-y divide-white/[0.06]">
                {state.result.outrankTargets.map((c) => (
                  <li
                    key={c.position}
                    className="flex items-center gap-3 px-5 py-3 text-sm"
                  >
                    <span className="font-bold tabular-nums">#{c.position}</span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-medium">{c.domain}</p>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {c.title.slice(0, 80)}
                        <ExternalLink className="size-2.5" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h3 className="text-sm font-semibold">What to do next</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {state.result.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <RecentRuns toolId="rank-where" refreshKey={refreshKey} />
    </div>
  );
}
