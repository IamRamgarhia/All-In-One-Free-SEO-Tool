import { db } from "@/db/client";
import { clientMetricSnapshots } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { TrendingDown, TrendingUp } from "lucide-react";

/**
 * Server component that pulls every snapshot for a client (sorted oldest
 * first) and renders four small SVG sparklines: clicks, sessions, top-10
 * keywords, and health score. If no snapshots exist yet, renders a hint
 * pointing to the daily-agent / weekly cron.
 */
export async function SnapshotSparklines({ clientId }: { clientId: number }) {
  const snapshots = await db
    .select()
    .from(clientMetricSnapshots)
    .where(eq(clientMetricSnapshots.clientId, clientId))
    .orderBy(asc(clientMetricSnapshots.capturedAt));

  if (snapshots.length === 0) {
    return null;
  }

  const series = [
    {
      label: "Organic clicks (28d)",
      values: snapshots.map((s) => s.organicClicks),
      tone: "#34d399",
    },
    {
      label: "GA4 sessions (28d)",
      values: snapshots.map((s) => s.ga4Sessions),
      tone: "#a78bfa",
    },
    {
      label: "Top-10 keywords",
      values: snapshots.map((s) => s.top10Count),
      tone: "#22d3ee",
    },
    {
      label: "Health score",
      values: snapshots.map((s) => s.healthScore),
      tone: "#f59e0b",
    },
  ];

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-3">
        <h2 className="text-sm font-semibold">Trend over time</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"}{" "}
          captured · earliest{" "}
          {snapshots[0].capturedAt.toLocaleDateString()}
        </p>
      </header>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {series.map((s) => (
          <Sparkline key={s.label} label={s.label} values={s.values} tone={s.tone} />
        ))}
      </div>
    </section>
  );
}

function Sparkline({
  label,
  values,
  tone,
}: {
  label: string;
  values: (number | null)[];
  tone: string;
}) {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => typeof p.v === "number");

  if (present.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">no data yet</div>
      </div>
    );
  }

  const W = 220;
  const H = 48;
  const minVal = Math.min(...present.map((p) => p.v));
  const maxVal = Math.max(...present.map((p) => p.v));
  const range = Math.max(maxVal - minVal, 1);
  const xStep = present.length > 1 ? W / (present.length - 1) : 0;
  const points = present.map(
    (p, idx) =>
      `${(idx * xStep).toFixed(1)},${(H - ((p.v - minVal) / range) * H).toFixed(1)}`,
  );
  const path = `M ${points.join(" L ")}`;

  const first = present[0].v;
  const last = present[present.length - 1].v;
  const delta = last - first;
  const deltaPct = first !== 0 ? Math.round((delta / first) * 100) : 0;
  const isUp = delta > 0;
  const isFlat = Math.abs(delta) < (range * 0.05);

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${
            isFlat
              ? "text-muted-foreground"
              : isUp
                ? "text-emerald-300"
                : "text-rose-300"
          }`}
        >
          {!isFlat && (isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
          {isFlat ? "→" : `${delta > 0 ? "+" : ""}${deltaPct}%`}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="text-base font-semibold tabular-nums">{last.toLocaleString()}</div>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
        >
          <path
            d={path}
            fill="none"
            stroke={tone}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* fill under the line */}
          <path
            d={`${path} L ${(present.length - 1) * xStep},${H} L 0,${H} Z`}
            fill={tone}
            opacity={0.12}
          />
        </svg>
      </div>
    </div>
  );
}
