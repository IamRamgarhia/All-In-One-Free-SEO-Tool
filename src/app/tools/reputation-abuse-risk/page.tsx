"use client";

import { useActionState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { scanForRisk, type ScanState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";

const RISK_TONE: Record<"low" | "medium" | "high", string> = {
  low: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  high: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export default function ReputationAbuseRiskPage() {
  const [state, formAction, pending] = useActionState<ScanState, FormData>(
    scanForRisk,
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
        title="Site reputation abuse risk scan"
        description="Google's site reputation abuse policy (March 2024, expanded Nov 2025) algorithmically flags sections of a site that look 'starkly different' from the main content and stops passing authority to them. We crawl your site, group by path, and flag sections at risk."
        icon={ShieldAlert}
        accent="rose"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Site URL</span>
          <input
            name="url"
            required
            placeholder="https://yoursite.com"
            className="h-10 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
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
              Crawling + scoring… (30-60s)
            </>
          ) : (
            <>
              <ShieldAlert className="mr-2 size-4" />
              Run risk scan
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Crawls up to 30 pages from the homepage&apos;s internal links. The
          scan groups pages by top-level path (e.g. <code>/blog/</code>,{" "}
          <code>/coupons/</code>) and compares each section&apos;s topic
          signature against the rest of the site.
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
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Overall risk for {state.report.domain}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${RISK_TONE[state.report.overall]}`}
              >
                {state.report.overall.toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-sm">{state.report.summary}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Crawled {state.report.pagesScanned} pages across{" "}
              {state.report.sections.length} sections.
            </p>
          </div>

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h3 className="text-sm font-semibold">Section breakdown</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Sorted by risk severity. Sections with low topic overlap and
                3+ pages are flagged.
              </p>
            </header>
            <ul className="divide-y divide-white/[0.06]">
              {state.report.sections.map((s) => (
                <li key={s.path} className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[12px]">
                      {s.path}
                    </code>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${RISK_TONE[s.risk]}`}
                    >
                      {s.risk}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {s.pageCount} pages · {Math.round(s.overlap * 100)}% topic
                      overlap with rest of site
                    </span>
                  </div>
                  {s.topicSignature.length > 0 && (
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      {s.topicSignature.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-white/5 px-1.5 py-0.5 text-muted-foreground ring-1 ring-inset ring-white/10"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.explanation && (
                    <p className="rounded-md border border-white/5 bg-black/20 p-3 text-xs">
                      {s.explanation}
                    </p>
                  )}
                  {s.samples.length > 0 && (
                    <div className="space-y-0.5 text-[11px] text-muted-foreground">
                      <p className="font-medium text-foreground/80">
                        Sample URLs
                      </p>
                      {s.samples.map((u) => (
                        <a
                          key={u}
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 truncate hover:text-foreground hover:underline"
                        >
                          {u.replace(/^https?:\/\/[^/]+/, "")}
                          <ExternalLink className="size-2.5" />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/5 bg-card/40 p-5 text-xs">
            <h3 className="font-semibold text-foreground/90">
              How to fix high-risk sections
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                If the section is third-party (affiliate / partner / outsourced
                content), restore <strong>first-party editorial oversight</strong>:
                a named editor on staff who reviews + bylines every page.
              </li>
              <li>
                If the section is genuinely off-topic for your brand,
                consider moving it to a <strong>subdomain you don&apos;t want
                to inherit authority from</strong> — Google treats subdomains
                as separate entities anyway, so the policy hit is moot there.
              </li>
              <li>
                If the section was useful but neglected, refresh it with the
                same brand voice as the rest of the site so the topic signature
                aligns.
              </li>
              <li>
                If the section is parasite SEO, take it down. Google&apos;s
                manual actions team is now actively de-indexing these.
              </li>
            </ul>
          </section>
        </>
      )}
      <RecentRuns toolId="reputation-abuse-risk" refreshKey={refreshKey} />
    </div>
  );
}
