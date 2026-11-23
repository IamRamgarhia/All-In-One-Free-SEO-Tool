"use client";

import { ToolBackLink } from "@/components/tools/tool-back-link";
import { useActionState, useState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import { Gauge, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { PageHeader } from "@/components/shell/page-header";
import { runBudget, type BudgetState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";

const DEFAULTS = {
  htmlKb: 100,
  cssKb: 100,
  jsKb: 350,
  imageKb: 500,
  fontKb: 200,
  totalKb: 1500,
  requests: 60,
  lcpMs: 2500,
  inpMs: 200,
  cls: 0.1,
};

export default function PerfBudgetPage() {
  const t = useTranslations("tools.ui.perf-budget");
  const tCommon = useTranslations("tools.common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<BudgetState, FormData>(
    runBudget,
    null,
  );
  const [budget, setBudget] = useState(DEFAULTS);
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ToolBackLink />

      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={Gauge}
        accent="amber"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-4 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">{tCommon("urlLabel")}</span>
          <input
            name="url"
            required
            placeholder="https://yoursite.com/page"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <fieldset className="space-y-3 rounded-xl border border-white/5 bg-black/20 p-4">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("byteBudgets")}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <BudgetInput name="htmlKb" label="HTML" value={budget.htmlKb} onChange={(v) => setBudget({ ...budget, htmlKb: v })} suffix="KB" />
            <BudgetInput name="cssKb" label="CSS" value={budget.cssKb} onChange={(v) => setBudget({ ...budget, cssKb: v })} suffix="KB" />
            <BudgetInput name="jsKb" label="JavaScript" value={budget.jsKb} onChange={(v) => setBudget({ ...budget, jsKb: v })} suffix="KB" />
            <BudgetInput name="imageKb" label={t("inputImages")} value={budget.imageKb} onChange={(v) => setBudget({ ...budget, imageKb: v })} suffix="KB" />
            <BudgetInput name="fontKb" label={t("inputFonts")} value={budget.fontKb} onChange={(v) => setBudget({ ...budget, fontKb: v })} suffix="KB" />
            <BudgetInput name="totalKb" label={t("inputTotal")} value={budget.totalKb} onChange={(v) => setBudget({ ...budget, totalKb: v })} suffix="KB" />
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-white/5 bg-black/20 p-4">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("requestBudgets")}
          </legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <BudgetInput name="requests" label={t("inputRequests")} value={budget.requests} onChange={(v) => setBudget({ ...budget, requests: v })} />
            <BudgetInput name="lcpMs" label="LCP" value={budget.lcpMs} onChange={(v) => setBudget({ ...budget, lcpMs: v })} suffix="ms" />
            <BudgetInput name="inpMs" label="INP" value={budget.inpMs} onChange={(v) => setBudget({ ...budget, inpMs: v })} suffix="ms" />
            <BudgetInput name="cls" label="CLS" value={budget.cls} onChange={(v) => setBudget({ ...budget, cls: v })} step="0.01" />
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-amber-500/15 px-5 text-sm font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("measuring")}
            </>
          ) : (
            t("submit")
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header
            className={`flex items-center justify-between border-b border-white/[0.06] px-5 py-4 ${
              state.fails === 0
                ? "bg-emerald-500/[0.06]"
                : "bg-rose-500/[0.06]"
            }`}
          >
            <h2 className="text-base font-semibold">
              {state.fails === 0
                ? t("allPassing")
                : t("overLimit", { count: state.fails })}
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {t("measuredAt", { time: new Date().toLocaleTimeString(locale) })}
            </span>
          </header>
          <ul className="divide-y divide-white/[0.06]">
            {state.lines.map((l) => (
              <li
                key={l.label}
                className="flex items-center gap-3 px-5 py-3 text-sm"
              >
                <span
                  className={`inline-flex h-6 w-12 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset ${
                    l.passed
                      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                      : "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                  }`}
                >
                  {l.passed ? t("pass") : t("fail")}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {l.key ? t(`lines.${l.key}`) : l.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t("budget", { value: l.budget })}
                </span>
                <span
                  className={`text-sm font-medium tabular-nums ${
                    l.passed ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {t("actual", { value: l.actual })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <RecentRuns toolId="perf-budget" refreshKey={refreshKey} />
    </div>
  );
}

function BudgetInput({
  name,
  label,
  value,
  onChange,
  suffix,
  step,
}: {
  name: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="relative">
        <input
          type="number"
          name={name}
          step={step ?? "1"}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 pr-10 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
