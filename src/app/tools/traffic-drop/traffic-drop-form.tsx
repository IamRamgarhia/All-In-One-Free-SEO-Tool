"use client";

import { useActionState } from "react";
import { Loader2, TrendingDown } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { runDiagnostic, type TrafficDropState } from "./actions";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import { ToolStat } from "@/components/tools/tool-stat";

export function TrafficDropForm({ properties }: { properties: string[] }) {
  const t = useTranslations("tools.ui.traffic-drop");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<
    TrafficDropState | null,
    FormData
  >(runDiagnostic, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t("gscProperty")}</span>
          <select
            name="siteUrl"
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
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-rose-500/15 px-5 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("pulling")}
            </>
          ) : (
            <>
              <TrendingDown className="mr-2 size-4" />
              {t("diagnose")}
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
          <div className="grid gap-3 sm:grid-cols-3">
            <ToolStat
              label={t("clicks28d")}
              value={state.result.recentClicks.toLocaleString(locale)}
              hint={t("prev", { value: state.result.prevClicks.toLocaleString(locale) })}
              tone={state.result.clicksDeltaPct < -5 ? "rose" : state.result.clicksDeltaPct < 0 ? "amber" : "emerald"}
            />
            <ToolStat
              label="Δ %"
              value={`${state.result.clicksDeltaPct >= 0 ? "+" : ""}${state.result.clicksDeltaPct.toFixed(1)}%`}
              hint={t("clicksDelta", { value: `${state.result.clicksDelta >= 0 ? "+" : ""}${state.result.clicksDelta.toLocaleString(locale)}` })}
              tone={state.result.clicksDeltaPct < -5 ? "rose" : state.result.clicksDeltaPct < 0 ? "amber" : "emerald"}
            />
            <ToolStat
              label={t("algorithmOverlap")}
              value={state.result.algorithmOverlaps.length.toString()}
              hint={
                state.result.algorithmOverlaps.length === 0
                  ? t("noUpdates")
                  : state.result.algorithmOverlaps[0].name
              }
              tone={state.result.algorithmOverlaps.length > 0 ? "rose" : "emerald"}
            />
          </div>

          {state.result.diagnosis && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
              <h2 className="text-base font-semibold">{t("aiDiagnosis")}</h2>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {state.result.diagnosis}
              </pre>
              <AiDisclaimer />
            </section>
          )}

          {state.result.topQueryDrops.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold">{t("topQueryDrops")}</h3>
              <ul className="divide-y divide-white/[0.05]">
                {state.result.topQueryDrops.map((d) => (
                  <li
                    key={d.query}
                    className="flex items-center justify-between py-1.5 text-xs"
                  >
                    <span className="truncate font-medium">{d.query}</span>
                    <span className="shrink-0 text-rose-300">
                      {d.prev} → {d.recent} ({d.delta})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {state.result.topPageDrops.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold">{t("topPageDrops")}</h3>
              <ul className="divide-y divide-white/[0.05]">
                {state.result.topPageDrops.map((d) => (
                  <li
                    key={d.page}
                    className="flex items-center justify-between py-1.5 text-xs"
                  >
                    <a
                      href={d.page}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium hover:underline"
                    >
                      {d.page.replace(/^https?:\/\/[^/]+/, "")}
                    </a>
                    <span className="shrink-0 text-rose-300">
                      {d.prev} → {d.recent} ({d.delta})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {state.result.algorithmOverlaps.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold">
                {t("updatesInWindow")}
              </h3>
              <ul className="space-y-2 text-xs">
                {state.result.algorithmOverlaps.map((u) => (
                  <li
                    key={u.name}
                    className="rounded-md bg-rose-500/5 p-3 ring-1 ring-inset ring-rose-500/20"
                  >
                    <div className="font-medium text-rose-200">{u.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {u.date} → {u.endDate ?? u.date} · {u.type}
                    </div>
                    <p className="mt-1 text-muted-foreground">{u.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
