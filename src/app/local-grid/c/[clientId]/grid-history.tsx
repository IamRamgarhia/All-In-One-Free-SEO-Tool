"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Heatmap } from "./heatmap";
// Type-only, so none of the lib's browser machinery is bundled. Imported
// rather than re-declared: this shape used to be written out separately
// here, in heatmap.tsx and in schema.ts, and the `error` field added on
// 30 Oct 2026 would have reached exactly one of them.
import type { GridCell } from "@/lib/local-grid";

type GridSnapshot = {
  id: number;
  query: string;
  ranAt: Date;
  gridSize: number;
  spacingM: number;
  cells: GridCell[];
  avgPosition: number | null;
  inPackPct: number | null;
};

export function GridHistory({ grids }: { grids: GridSnapshot[] }) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <History className="size-4 text-cyan-300" />
          Recent grid runs ({grids.length})
        </h2>
      </header>
      <ul className="divide-y divide-white/[0.05]">
        {grids.map((g) => (
          <li key={g.id} className="px-5 py-3 text-sm">
            <button
              type="button"
              onClick={() => setOpenId(openId === g.id ? null : g.id)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{g.query}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(g.ranAt).toLocaleString()} · {g.gridSize}×{g.gridSize} ·{" "}
                  {g.spacingM}m spacing
                </div>
              </div>
              <div className="text-right">
                {/* Null means the run produced no conclusive cell, not
                    zero visibility. `?? 0` rendered that as a confident
                    "0% in pack" — the worst reading available. */}
                <div
                  className={
                    g.inPackPct === null
                      ? "font-semibold text-muted-foreground"
                      : "font-semibold text-emerald-300"
                  }
                >
                  {g.inPackPct === null
                    ? "not measured"
                    : `${g.inPackPct}% in pack`}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  avg #{g.avgPosition ?? "—"}
                </div>
              </div>
            </button>
            {openId === g.id && (
              <div className="mt-3">
                <Heatmap
                  cells={g.cells}
                  size={g.gridSize}
                  prior={
                    grids.find(
                      (other) =>
                        other.id !== g.id &&
                        other.query === g.query &&
                        other.gridSize === g.gridSize &&
                        new Date(other.ranAt).getTime() <
                          new Date(g.ranAt).getTime(),
                    )?.cells ?? null
                  }
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
