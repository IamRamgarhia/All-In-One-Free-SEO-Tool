"use client";

import { ToolBackLink } from "@/components/tools/tool-back-link";
import { usePresetUrl } from "@/components/use-preset-url";
import { useActionState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import { ExternalLink, Loader2, Network } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shell/page-header";
import { runFacetTrap, type FacetTrapState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";

const RISK_TONE = {
  low: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  high: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export default function FacetTrapPage() {
  // Opened from a client's file: the page (or site) arrives filled in.
  const presetUrl = usePresetUrl();
  const t = useTranslations("tools.ui.facet-trap");
  const [state, formAction, pending] = useActionState<FacetTrapState, FormData>(
    runFacetTrap,
    null,
  );
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ToolBackLink />

      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={Network}
        accent="rose"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t("urlLabel")}</span>
          <input
            name="url"
            defaultValue={presetUrl}
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
              {t("running")}
            </>
          ) : (
            <>
              <Network className="mr-2 size-4" />
              {t("submit")}
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          {t("help")}
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
                {t(`risk.${state.report.overall}`).toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-sm">{state.report.summary}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("stats", {
                pages: state.report.pagesScanned,
                shapes: state.report.uniqueShapes,
                facets: state.report.facetUrlCount,
              })}
            </p>
          </div>

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h3 className="text-sm font-semibold">{t("groupsTitle")}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("groupsHelp")}
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
                      {t(`risk.${g.risk}`)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("urlCount", { count: g.count })}
                    </span>
                    {g.hasFilterParams && (
                      <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300 ring-1 ring-inset ring-rose-500/30">
                        {t("tags.filter")}
                      </span>
                    )}
                    {g.hasPaginationOnly && (
                      <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
                        {t("tags.pagination")}
                      </span>
                    )}
                    {g.hasTrackingOnly && (
                      <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-500/30">
                        {t("tags.tracking")}
                      </span>
                    )}
                    {g.hasCanonicalAway && (
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                        {t("tags.canonicalAway")}
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
