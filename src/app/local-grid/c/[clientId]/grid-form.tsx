"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { runGrid, type GridState } from "../../actions";
import { Heatmap } from "./heatmap";

export function GridForm({ clientId }: { clientId: number }) {
  const [state, formAction, pending] = useActionState<GridState | null, FormData>(
    runGrid,
    null,
  );
  const t = useTranslations("localTab.localGrid.form");

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs md:col-span-3">
            <span className="text-muted-foreground">{t("queryLabel")}</span>
            <input
              name="query"
              required
              placeholder={t("queryPlaceholder")}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("centerLat")}</span>
            <input
              name="centerLat"
              type="number"
              step="0.000001"
              required
              placeholder="45.5152"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("centerLng")}</span>
            <input
              name="centerLng"
              type="number"
              step="0.000001"
              required
              placeholder="-122.6784"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("gridLabel")}</span>
            <select
              name="size"
              defaultValue="5"
              className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="3">{t("size3")}</option>
              <option value="5">{t("size5")}</option>
              <option value="7">{t("size7")}</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("spacing")}</span>
            <input
              name="spacingM"
              type="number"
              defaultValue={1500}
              min={500}
              max={10000}
              step={250}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center self-end rounded-md bg-emerald-500/15 px-4 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                {t("running")}
              </>
            ) : (
              t("run")
            )}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("tip")}
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">
              {t("resultTitle", { query: state.result.query })}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {state.result.inPackPct === null
                ? t("resultNotMeasured")
                : t.rich("resultSummaryConclusive", {
                    pct: state.result.inPackPct,
                    cells: state.result.conclusiveCells,
                    avg: state.result.avgPosition ?? t("notRanked"),
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
            </p>
            {state.result.failedCells > 0 && (
              // Said on the card, not in a tooltip: a grid where half the
              // points were blocked is a different measurement from one
              // where half the points genuinely do not rank.
              <p className="mt-1.5 text-[11px] text-amber-300">
                {t("resultFailedCells", {
                  failed: state.result.failedCells,
                  total: state.result.cells.length,
                })}
              </p>
            )}
          </header>
          <div className="p-5">
            <Heatmap
              cells={state.result.cells}
              size={state.result.gridSize}
            />
          </div>
        </section>
      )}
    </>
  );
}
