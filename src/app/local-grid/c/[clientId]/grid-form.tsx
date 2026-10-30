"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { runGrid, type GridState } from "../../actions";
import { Heatmap } from "./heatmap";

export function GridForm({ clientId }: { clientId: number }) {
  const [state, formAction, pending] = useActionState<GridState | null, FormData>(
    runGrid,
    null,
  );

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs md:col-span-3">
            <span className="text-muted-foreground">Search query</span>
            <input
              name="query"
              required
              placeholder="vegan bakery near me"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Centre latitude</span>
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
            <span className="text-muted-foreground">Centre longitude</span>
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
            <span className="text-muted-foreground">Grid (3-7)</span>
            <select
              name="size"
              defaultValue="5"
              className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="3">3×3 (9 points, fast)</option>
              <option value="5">5×5 (25 points)</option>
              <option value="7">7×7 (49 points, slow)</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Spacing (metres)</span>
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
                Running…
              </>
            ) : (
              "Run grid"
            )}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Tip: drop a Google Maps pin on the centre of your service area, copy
          the coordinates from the URL.
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
              Result: &quot;{state.result.query}&quot;
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {state.result.inPackPct === null ? (
                <>No cell could be checked, so in-pack share is unknown</>
              ) : (
                <>
                  In-pack at <strong>{state.result.inPackPct}%</strong> of the{" "}
                  {state.result.conclusiveCells} cells we could check
                </>
              )}{" "}
              · avg position{" "}
              <strong>{state.result.avgPosition ?? "(not ranked)"}</strong>
            </p>
            {state.result.failedCells > 0 && (
              // Say it on the card, not just in a tooltip. A grid where
              // half the cells were blocked is a different measurement
              // from a grid where half the cells genuinely do not rank,
              // and the two used to look identical.
              <p className="mt-1.5 text-[11px] text-amber-300">
                {state.result.failedCells} of {state.result.cells.length} cells
                gave no answer (blocked or unreachable) and are excluded
                rather than counted as not ranking.
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
