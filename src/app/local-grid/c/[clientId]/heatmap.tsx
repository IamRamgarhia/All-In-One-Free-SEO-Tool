"use client";

// Type-only import, not a fourth copy of this shape. See grid-history.tsx.
import type { GridCell as Cell } from "@/lib/local-grid";

/**
 * Render the grid as a square SVG heatmap. Position 1-3 = green (in pack),
 * 4-10 = amber (page 1), 11-20 = orange, 21+ = red, null = grey.
 *
 * A cell whose check never completed is slate with a "?", not grey with
 * a dash: it is not a ranking of any kind. Until 30 Oct 2026 it was
 * drawn identically to "not ranked", and `computeDelta` then labelled it
 * **lost** in red against the previous run — so one captcha made the
 * whole map read as a ranking collapse.
 */
export function Heatmap({
  cells,
  size,
  prior,
}: {
  cells: Cell[];
  size: number;
  prior?: Cell[] | null;
}) {
  if (cells.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No cells to display.</p>
    );
  }

  // The cells are emitted row-major from buildGrid. Render north (row 0)
  // at the bottom so the heatmap reads like a map.
  const rows: Cell[][] = [];
  for (let r = 0; r < size; r++) {
    rows.unshift(cells.slice(r * size, (r + 1) * size));
  }
  const priorRows: Cell[][] = [];
  if (prior && prior.length === cells.length) {
    for (let r = 0; r < size; r++) {
      priorRows.unshift(prior.slice(r * size, (r + 1) * size));
    }
  }

  const tile = 64;
  const gap = 6;
  const total = tile * size + gap * (size - 1);

  return (
    <div className="space-y-3">
      <div
        style={{ width: total, height: total }}
        className="relative mx-auto"
      >
        {rows.flatMap((row, rIdx) =>
          row.map((cell, cIdx) => {
            const x = cIdx * (tile + gap);
            const y = rIdx * (tile + gap);
            const unknown = cell.position === null && !!cell.error;
            const tone = unknown ? UNKNOWN_TONE : positionTone(cell.position);
            const priorCell = priorRows[rIdx]?.[cIdx];
            const delta = computeDelta(priorCell ?? null, cell);
            return (
              <div
                key={`${rIdx}-${cIdx}`}
                title={`(${cell.lat.toFixed(4)}, ${cell.lng.toFixed(4)}) — ${
                  unknown
                    ? `no answer: ${cell.error}`
                    : (cell.position ?? "not ranked")
                }${delta ? ` · was ${priorCell?.position ?? "—"}` : ""}`}
                style={{ left: x, top: y, width: tile, height: tile }}
                className={`absolute grid place-items-center rounded-md text-xs font-bold tabular-nums ring-1 ring-inset ${tone}`}
              >
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span>{unknown ? "?" : (cell.position ?? "—")}</span>
                  {delta && (
                    <span
                      className={`text-[9px] font-bold ${
                        delta.tone === "up"
                          ? "text-emerald-200"
                          : delta.tone === "down"
                            ? "text-rose-200"
                            : "text-foreground/60"
                      }`}
                    >
                      {delta.label}
                    </span>
                  )}
                </div>
              </div>
            );
          }),
        )}
      </div>
      <Legend />
    </div>
  );
}

/**
 * Compare a cell against the same cell in the previous run.
 *
 * Takes whole cells rather than two positions so it can see the
 * difference between "not ranked" and "we never found out". A cell with
 * no answer gets no delta at all: calling it **lost** was a claim that a
 * ranking disappeared, drawn in red, on no evidence whatsoever. The same
 * applies in reverse — a prior run that was blocked makes "new"
 * meaningless, because we never knew the old position.
 */
function computeDelta(
  priorCell: Cell | null,
  currentCell: Cell,
): { label: string; tone: "up" | "down" | "flat" } | null {
  if (currentCell.error && currentCell.position === null) return null;
  if (priorCell?.error && priorCell.position === null) return null;

  const prior = priorCell ? priorCell.position : null;
  const current = currentCell.position;
  if (prior === null && current === null) return null;
  if (prior === null) return { label: "new", tone: "up" };
  if (current === null) return { label: "lost", tone: "down" };
  const diff = prior - current;
  if (Math.abs(diff) < 1) return { label: "→", tone: "flat" };
  return {
    label: `${diff > 0 ? "▲" : "▼"}${Math.abs(diff)}`,
    tone: diff > 0 ? "up" : "down",
  };
}

/** A cell we never got an answer for. Deliberately not grey — grey is
 *  "checked, not ranking", which is a real and different result. */
const UNKNOWN_TONE =
  "bg-slate-500/20 text-slate-300 ring-slate-400/40 border-dashed";

function positionTone(p: number | null): string {
  if (p === null) return "bg-white/5 text-muted-foreground ring-white/10";
  if (p <= 3) return "bg-emerald-500/40 text-emerald-100 ring-emerald-400/60";
  if (p <= 10) return "bg-amber-500/30 text-amber-100 ring-amber-400/50";
  if (p <= 20) return "bg-orange-500/30 text-orange-100 ring-orange-400/50";
  return "bg-rose-500/25 text-rose-100 ring-rose-400/40";
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground">
      <LegendDot tone="bg-emerald-500/40 ring-emerald-400/60" label="1-3 (in pack)" />
      <LegendDot tone="bg-amber-500/30 ring-amber-400/50" label="4-10" />
      <LegendDot tone="bg-orange-500/30 ring-orange-400/50" label="11-20" />
      <LegendDot tone="bg-rose-500/25 ring-rose-400/40" label="21+" />
      <LegendDot tone="bg-white/5 ring-white/10" label="Not ranked" />
      <LegendDot
        tone="bg-slate-500/20 ring-slate-400/40"
        label="? No answer (blocked)"
      />
    </div>
  );
}

function LegendDot({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-3 rounded-sm ring-1 ring-inset ${tone}`} />
      <span>{label}</span>
    </span>
  );
}
