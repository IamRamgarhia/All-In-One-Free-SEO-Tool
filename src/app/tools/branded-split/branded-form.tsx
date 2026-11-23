"use client";

import { useActionState } from "react";
import { GitMerge, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { runSplit, type BrandedSplitState } from "./actions";

export function BrandedForm({ properties }: { properties: string[] }) {
  const t = useTranslations("tools.ui.branded-split");
  const [state, formAction, pending] = useActionState<
    BrandedSplitState | null,
    FormData
  >(runSplit, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t("property")}</span>
          <select
            name="site"
            required
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {properties.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            {t("brandTerms")}
          </span>
          <input
            name="brandTerms"
            required
            placeholder="acme, acme corp, acmeapp, acme inc"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-amber-500/15 px-5 text-sm font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("splitting")}
            </>
          ) : (
            <>
              <GitMerge className="mr-2 size-4" />
              {t("split")}
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
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <SideCard
              label={t("branded")}
              clicks={state.summary.brandedClicks}
              impressions={state.summary.brandedImpressions}
              queries={state.summary.brandedQueries}
              delta={state.delta.brandedDelta}
              prev={state.delta.prevBrandedClicks}
              tone="violet"
            />
            <SideCard
              label={t("nonBranded")}
              clicks={state.summary.nonBrandedClicks}
              impressions={state.summary.nonBrandedImpressions}
              queries={state.summary.nonBrandedQueries}
              delta={state.delta.nonBrandedDelta}
              prev={state.delta.prevNonBrandedClicks}
              tone="cyan"
            />
          </div>

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h3 className="text-sm font-semibold">{t("allQueries")}</h3>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">{t("colQuery")}</th>
                    <th className="px-4 py-2 text-center">{t("colType")}</th>
                    <th className="px-4 py-2 text-right">{t("colClicks")}</th>
                    <th className="px-4 py-2 text-right">{t("colImpressions")}</th>
                    <th className="px-4 py-2 text-right">{t("colCtr")}</th>
                    <th className="px-4 py-2 text-right">{t("colPosition")}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.slice(0, 100).map((r) => (
                    <tr key={r.query} className="border-t border-white/[0.04]">
                      <td className="px-4 py-1.5 font-medium">{r.query}</td>
                      <td className="px-4 py-1.5 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ring-1 ring-inset ${r.branded ? "bg-violet-500/15 text-violet-300 ring-violet-500/30" : "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30"}`}
                        >
                          {r.branded ? t("tagBrand") : t("tagNonBrand")}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{r.clicks}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                        {r.impressions}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                        {(r.ctr * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                        {r.position.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function SideCard({
  label,
  clicks,
  impressions,
  queries,
  delta,
  prev,
  tone,
}: {
  label: string;
  clicks: number;
  impressions: number;
  queries: number;
  delta: number;
  prev: number;
  tone: "violet" | "cyan";
}) {
  const pct = prev > 0 ? (delta / prev) * 100 : 0;
  const deltaTone =
    delta < 0 && Math.abs(pct) > 5
      ? "text-rose-300"
      : delta > 0
        ? "text-emerald-300"
        : "text-muted-foreground";
  const tr = useTranslations("tools.ui.branded-split");
  const locale = useLocale();
  const t = tone === "violet" ? "text-violet-300" : "text-cyan-300";
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
      <div className={`text-xs font-semibold uppercase tracking-wider ${t}`}>
        {label}
      </div>
      <div className="text-3xl font-bold tabular-nums">{clicks.toLocaleString(locale)}</div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {tr("sideStats", { impressions: impressions.toLocaleString(locale), queries })}
      </div>
      <div className={`text-xs tabular-nums ${deltaTone}`}>
        {tr("sideDelta", {
          delta: `${delta >= 0 ? "+" : ""}${delta}`,
          pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}`,
        })}
      </div>
    </section>
  );
}
