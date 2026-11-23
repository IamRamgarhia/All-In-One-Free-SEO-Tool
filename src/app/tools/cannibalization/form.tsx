"use client";

import { useActionState, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Split } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { runCannibalScan, type CannibalState } from "./actions";

const SEVERITY_TONE = {
  high: "border-rose-500/40 bg-rose-500/[0.04] text-rose-300",
  medium: "border-amber-500/40 bg-amber-500/[0.04] text-amber-300",
  low: "border-white/10 bg-white/[0.02] text-muted-foreground",
} as const;

const SEVERITY_LABEL_KEY = {
  high: "severityHigh",
  medium: "severityMedium",
  low: "severityLow",
} as const;

export function CannibalForm({ properties }: { properties: string[] }) {
  const t = useTranslations("tools.ui.cannibalization");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<
    CannibalState | null,
    FormData
  >(runCannibalScan, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{t("gscProperty")}</span>
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
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-rose-500/15 px-5 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("scanning")}
            </>
          ) : (
            <>
              <Split className="mr-2 size-4" />
              {t("submit")}
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          {t("filterHint")}
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t("groupsFound")}
              value={state.summary.groupsFound.toString()}
              tone={
                state.summary.groupsFound > 0 ? "rose" : "emerald"
              }
            />
            <Stat
              label={t("highSeverity")}
              value={state.summary.highSeverity.toString()}
              tone={state.summary.highSeverity > 0 ? "rose" : "emerald"}
            />
            <Stat
              label={t("queriesAnalyzed")}
              value={state.summary.queriesAnalyzed.toLocaleString(locale)}
              tone="muted"
            />
          </div>

          {state.groups.length === 0 ? (
            <div className="glass-apple rounded-2xl p-6 text-center text-sm text-emerald-300">
              ✓ {t("noneDetected")}
            </div>
          ) : (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">
                  {t("groupsTitle", { count: state.groups.length })}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("groupsHint")}
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {state.groups.map((g) => (
                  <CannibalRow key={g.query} group={g} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

function CannibalRow({
  group,
}: {
  group: NonNullable<Extract<CannibalState, { ok: true }>["groups"]>[number];
}) {
  const t = useTranslations("tools.ui.cannibalization");
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-white/[0.02]"
      >
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
        <span className="flex-1 font-medium">{group.query}</span>
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${SEVERITY_TONE[group.severity]}`}
        >
          {t(SEVERITY_LABEL_KEY[group.severity])}
        </span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {t("rowStats", {
            pages: group.pages.length,
            clicks: group.totalClicks,
          })}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/[0.04] bg-white/[0.01] px-5 py-3">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">{t("colPage")}</th>
                <th className="px-2 py-1.5 text-right">{t("colPosition")}</th>
                <th className="px-2 py-1.5 text-right">{t("colClicks")}</th>
                <th className="px-2 py-1.5 text-right">{t("colImpressions")}</th>
                <th className="px-2 py-1.5 text-right">{t("colCtr")}</th>
              </tr>
            </thead>
            <tbody>
              {group.pages.map((p) => {
                const keeper = p.page === group.recommendedKeeper;
                return (
                  <tr
                    key={p.page}
                    className={`border-t border-white/[0.04] ${keeper ? "bg-emerald-500/[0.04]" : ""}`}
                  >
                    <td className="px-2 py-1.5">
                      <a
                        href={p.page}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground"
                      >
                        {p.page.replace(/^https?:\/\/[^/]+/, "") || "/"}
                      </a>
                      {keeper && (
                        <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                          {t("keep")}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {p.position.toFixed(1)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {p.clicks}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {p.impressions}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {(p.ctr * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "emerald" | "muted";
}) {
  const t =
    tone === "rose"
      ? "text-rose-300"
      : tone === "emerald"
        ? "text-emerald-300"
        : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t}`}>
        {value}
      </div>
    </div>
  );
}
