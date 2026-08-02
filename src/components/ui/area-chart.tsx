"use client";

/**
 * Tremor-style area chart built on Recharts. Matches the visual style
 * of https://shadcn-admin.netlify.app dashboard charts: gradient fill,
 * single primary stroke, minimal axes, tooltip on hover.
 *
 * Pass a `data` array of `{ name: string, value: number }` items. Most
 * usages will be tiny — the dashboard hero shows ~30 audits worth of
 * data — so we keep the chart deliberately simple and bundle-friendly.
 */

import { useId } from "react";
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { name: string; value: number };

type Props = {
  data: Point[];
  /** Optional Tailwind color class for the line / fill (e.g. "text-violet-500") */
  colorClass?: string;
  /**
   * Format hint for the y-axis label and tooltip value. Must be a
   * serializable string (NOT a function) so server components can pass
   * it. Pick from the supported tokens below or send a printf-style
   * suffix like "%v ms" / "%v K". Default formats as a localized integer.
   *
   *   - "int"      → round + locale group ("12,345")
   *   - "decimal"  → 1 decimal place ("12.3")
   *   - "percent"  → "%v%"  ("85%")
   *   - "score"    → integer 0-100
   *   - any string containing "%v" replaces it with the value
   */
  formatValue?: string;
  /** Show axes (default true) */
  showAxes?: boolean;
  /** Height in pixels (default 200) */
  height?: number;
  /** Empty-state placeholder when data is too small */
  emptyHint?: string;
};

function formatNumber(v: number, fmt: string | undefined): string {
  if (!fmt || fmt === "int") return Math.round(v).toLocaleString();
  if (fmt === "decimal") return v.toFixed(1);
  if (fmt === "percent") return `${Math.round(v)}%`;
  if (fmt === "score") return `${Math.round(v)}`;
  if (fmt.includes("%v")) return fmt.replace("%v", v.toLocaleString());
  return v.toLocaleString();
}

export function AreaChart({
  data,
  colorClass = "text-violet-500",
  formatValue,
  showAxes = true,
  height = 200,
  emptyHint = "Not enough data yet",
}: Props) {
  // Unique gradient ID so multiple charts on one page don't collide.
  //
  // useId, not Math.random(): the random version generated a different
  // id on the server than on the client, so the SSR'd <linearGradient
  // id> never matched the hydrated fill="url(#...)" — the area fill
  // silently dropped to transparent on first paint. It also produced a
  // fresh id on every re-render, orphaning the previous <defs> entry.
  //
  // Declared before the early return: hooks must run unconditionally.
  const gradientId = `area-grad-${useId().replace(/:/g, "")}`;

  const fmt = (v: number) => formatNumber(v, formatValue);
  if (data.length < 2) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-muted-foreground"
      >
        {emptyHint}
      </div>
    );
  }

  return (
    <div style={{ height }} className={colorClass}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart
          data={data}
          margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          {showAxes && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(1 0 0 / 0.06)"
              vertical={false}
            />
          )}
          {showAxes && (
            <XAxis
              dataKey="name"
              stroke="oklch(0.708 0 0)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
          )}
          {showAxes && (
            <YAxis
              stroke="oklch(0.708 0 0)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmt}
              width={40}
            />
          )}
          <Tooltip
            cursor={{ stroke: "oklch(1 0 0 / 0.12)", strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: "oklch(0.205 0 0)",
              border: "1px solid oklch(1 0 0 / 0.1)",
              borderRadius: 8,
              fontSize: 12,
              padding: "6px 10px",
              color: "oklch(0.985 0 0)",
            }}
            labelStyle={{ color: "oklch(0.708 0 0)", marginBottom: 2 }}
            formatter={(value) =>
              [fmt(Number(value) || 0), ""] as [string, string]
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
