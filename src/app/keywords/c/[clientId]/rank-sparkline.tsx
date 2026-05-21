"use client";

/**
 * Per-row rank trend sparkline. Migrated off @tremor/react (which is
 * effectively in maintenance mode) to plain recharts — we already have
 * recharts as a dep. Direction-aware coloring (green = rank improved,
 * red = rank dropped) preserved.
 *
 * Position semantics are inverted (lower position = better rank), so
 * the chart plots `100 - position` to keep the natural "up = better"
 * direction. The numbers themselves never render — this is a trend
 * indicator, not a reading.
 */

import { Area, AreaChart, ResponsiveContainer } from "recharts";

type Point = {
  checkedAt: Date;
  position: number | null;
};

export function RankSparkline({ history }: { history: Point[] }) {
  const filtered = history.filter(
    (h): h is Point & { position: number } => h.position !== null,
  );
  if (filtered.length < 2) {
    return (
      <span className="text-[11px] text-muted-foreground/50">
        Needs ≥2 checks
      </span>
    );
  }

  const data = filtered.map((p) => ({
    t: p.checkedAt.toISOString().slice(5, 10),
    rank: 100 - p.position,
  }));

  const first = filtered[0].position;
  const last = filtered[filtered.length - 1].position;
  // Lower position is better — invert for direction
  const strokeColor =
    last < first
      ? "rgb(52 211 153)" // emerald-400
      : last > first
        ? "rgb(251 113 133)" // rose-400
        : "rgb(148 163 184)"; // slate-400

  const gradientId = `rank-spark-${strokeColor.replace(/[^a-z0-9]/g, "")}`;

  return (
    <div className="h-6 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 1, right: 0, bottom: 1, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="rank"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
