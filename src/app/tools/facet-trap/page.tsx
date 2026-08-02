"use client";

import { useActionState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Network } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { runFacetTrap, type FacetTrapState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";

const RISK_TONE = {
  low: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  high: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export default function FacetTrapPage() {
  const [state, formAction, pending] = useActionState<FacetTrapState, FormData>(
    runFacetTrap,
    null,
  );
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All tools
      </Link>

      <PageHeader
        title="Faceted-nav crawl-trap detector"
        description="Filter / sort / pagination params on category pages can balloon a crawl from thousands to millions of near-duplicate URLs. We crawl + group URLs by query shape and flag the ones that need canonical/noindex protection."
        icon={Network}
        accent="rose"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Site URL (homepage or any category)</span>
          <input
            name="url"
            required
            placeholder="https://yoursite.com"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-rose-500/15 px-5 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Crawling… (60-120s)
            </>
          ) : (
            <>
              <Network className="mr-2 size-4" />
              Detect facet traps
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Crawls up to 60 pages from the homepage. Groups URLs by their
          query-string shape and classifies each group as filter / pagination
          / tracking / clean.
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <div
            className={`rounded-2xl border p-5 ${
              state.report.overall === "high"
                ? "border-rose-500/30 bg-rose-500/5"
                : state.report.overall === "medium"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-emerald-500/30 bg-emerald-500/5"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">
                {state.report.domain}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${RISK_TONE[state.report.overall]}`}
              >
                {state.report.overall.toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-sm">{state.report.summary}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {state.report.pagesScanned} pages scanned · {state.report.uniqueShapes} unique URL shapes ·{" "}
              {state.report.facetUrlCount} facet-shaped URLs found
            </p>
          </div>

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h3 className="text-sm font-semibold">URL shape groups</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Sorted by risk severity, then by group size.
              </p>
            </header>
            <ul className="divide-y divide-white/[0.06]">
              {state.report.groups.map((g) => (
                <li key={g.shape} className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[12px]">
                      {g.shape}
                    </code>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${RISK_TONE[g.risk]}`}
                    >
                      {g.risk}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {g.count} URL{g.count === 1 ? "" : "s"}
                    </span>
                    {g.hasFilterParams && (
                      <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300 ring-1 ring-inset ring-rose-500/30">
                        filter params
                      </span>
                    )}
                    {g.hasPaginationOnly && (
                      <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
                        pagination
                      </span>
                    )}
                    {g.hasTrackingOnly && (
                      <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-500/30">
                        tracking only
                      </span>
                    )}
                    {g.hasCanonicalAway && (
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                        canonical-away ✓
                      </span>
                    )}
                    {g.hasNoindex && (
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                        noindex ✓
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {g.recommendation}
                  </p>
                  {g.samples.length > 0 && (
                    <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                      {g.samples.map((u) => (
                        <li key={u}>
                          <a
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 truncate hover:text-foreground hover:underline"
                          >
                            {u.replace(/^https?:\/\/[^/]+/, "")}
                            <ExternalLink className="size-2.5" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <RecentRuns toolId="facet-trap" refreshKey={refreshKey} />
    </div>
  );
}
