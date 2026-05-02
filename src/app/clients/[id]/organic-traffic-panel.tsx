import { TrendingDown, TrendingUp, Activity } from "lucide-react";
import { getGa4OrganicTraffic } from "@/lib/google-data";
import { cn } from "@/lib/utils";

export async function OrganicTrafficPanel({
  propertyId,
}: {
  propertyId: string;
}) {
  const rows = await getGa4OrganicTraffic({ propertyId, days: 28 });

  const totals = rows.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      users: acc.users + r.users,
      pageviews: acc.pageviews + r.pageviews,
    }),
    { sessions: 0, users: 0, pageviews: 0 },
  );

  // Compute week-over-week change for sessions
  const half = Math.floor(rows.length / 2);
  const recent = rows.slice(half).reduce((s, r) => s + r.sessions, 0);
  const prior = rows.slice(0, half).reduce((s, r) => s + r.sessions, 0);
  const delta =
    prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null;

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-cyan-500/15 blur-3xl" />
      <header className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Activity className="size-4 text-cyan-300" />
            Organic traffic (last 28 days)
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Real GA4 data — only Organic Search sessions, not paid or social.
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No GA4 data yet for this period.
        </div>
      ) : (
        <div className="relative space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Sessions"
              value={totals.sessions}
              delta={delta}
              accent="cyan"
            />
            <Metric
              label="Users"
              value={totals.users}
              accent="violet"
            />
            <Metric
              label="Pageviews"
              value={totals.pageviews}
              accent="emerald"
            />
          </div>
          <Sparkline values={rows.map((r) => r.sessions)} />
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  delta,
  accent,
}: {
  label: string;
  value: number;
  delta?: number | null;
  accent: "cyan" | "violet" | "emerald";
}) {
  const accentText = {
    cyan: "text-gradient-cyan",
    violet: "text-gradient-violet",
    emerald: "text-gradient-emerald",
  }[accent];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-3xl font-semibold tabular-nums", accentText)}>
        {value.toLocaleString()}
      </div>
      {typeof delta === "number" && (
        <div
          className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
            delta > 0
              ? "text-emerald-300"
              : delta < 0
                ? "text-rose-300"
                : "text-muted-foreground"
          }`}
        >
          {delta > 0 ? (
            <TrendingUp className="size-3" />
          ) : delta < 0 ? (
            <TrendingDown className="size-3" />
          ) : null}
          {delta > 0 ? "+" : ""}
          {delta}% vs prior period
        </div>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 600;
  const h = 60;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-16 w-full"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.74 0.18 200)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="oklch(0.74 0.18 200)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill="url(#spark-fill)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="oklch(0.78 0.17 200)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
