"use client";

/**
 * AI usage visualizations. Migrated off @tremor/react (effectively in
 * maintenance mode) to plain recharts, which we already ship.
 *
 * Two panels:
 *   - "Last 30 days · calls per day" — bar chart, cyan accent
 *   - "Cost by feature" — donut, cycling through the brand palette
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, PieChart as PieChartIcon } from "lucide-react";

type DailyPoint = {
  day: string;
  calls: number;
  cost: number;
};

type FeatureRow = {
  feature: string;
  calls: number;
  cost: number;
  tokens: number;
};

// Match the previous tremor palette (cyan / violet / amber / emerald / rose / indigo / pink / sky)
const FEATURE_COLORS = [
  "rgb(34 211 238)",   // cyan-400
  "rgb(167 139 250)",  // violet-400
  "rgb(251 191 36)",   // amber-400
  "rgb(52 211 153)",   // emerald-400
  "rgb(251 113 133)",  // rose-400
  "rgb(129 140 248)",  // indigo-400
  "rgb(244 114 182)",  // pink-400
  "rgb(56 189 248)",   // sky-400
];

const CYAN = "rgb(34 211 238)";

export function UsageCharts({
  days,
  featureRows,
}: {
  days: DailyPoint[];
  featureRows: FeatureRow[];
}) {
  // Donut wants whole-dollar values (cost is in micros — divide once)
  const featureChart = featureRows
    .filter((r) => r.cost > 0)
    .slice(0, 8)
    .map((r) => ({
      name: r.feature,
      cost: r.cost / 1_000_000,
      calls: r.calls,
    }));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Daily calls — 2/3 width */}
      <section className="rounded-xl border border-border bg-card p-5 shadow lg:col-span-2">
        <header className="mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-[oklch(0.74_0.18_215)]" />
            Last 30 days · calls per day
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Hover bars for daily totals + estimated cost.
          </p>
        </header>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(255 255 255 / 0.05)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: "rgb(148 163 184)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "rgb(148 163 184)" }}
                tickLine={false}
                axisLine={false}
                width={32}
                tickFormatter={(v) => v.toLocaleString()}
              />
              <Tooltip
                contentStyle={{
                  background: "rgb(15 23 42)",
                  border: "1px solid rgb(255 255 255 / 0.08)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value) => [Number(value).toLocaleString(), "calls"]}
                labelStyle={{ color: "rgb(226 232 240)" }}
              />
              <Bar dataKey="calls" fill={CYAN} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Per-feature donut — 1/3 width */}
      <section className="rounded-xl border border-border bg-card p-5 shadow">
        <header className="mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <PieChartIcon className="size-4 text-[oklch(0.68_0.16_295)]" />
            Cost by feature
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Last 30 days. Top 8 features by spend.
          </p>
        </header>
        {featureChart.length === 0 ? (
          <div className="flex h-44 items-center justify-center text-xs text-muted-foreground">
            No cost data yet
          </div>
        ) : (
          <>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={featureChart}
                    dataKey="cost"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {featureChart.map((_, i) => (
                      <Cell
                        key={i}
                        fill={FEATURE_COLORS[i % FEATURE_COLORS.length]}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "rgb(15 23 42)",
                      border: "1px solid rgb(255 255 255 / 0.08)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(value, name) => [
                      `$${Number(value).toFixed(3)}`,
                      String(name),
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {featureChart.map((f, i) => (
                <li key={f.name} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{
                      background: FEATURE_COLORS[i % FEATURE_COLORS.length],
                    }}
                  />
                  {f.name}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
