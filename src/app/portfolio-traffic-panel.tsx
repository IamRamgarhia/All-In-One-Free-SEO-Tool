import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getPortfolioTraffic } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export async function PortfolioTrafficPanel() {
  const data = await getPortfolioTraffic();
  if (data.clientsContributing === 0) return null;

  return (
    <section className="glass-apple animate-page-enter relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute -left-12 -top-12 size-48 rounded-full bg-cyan-500/15 blur-3xl" />
      <header className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Activity className="size-4 text-cyan-300" />
            Portfolio organic traffic
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sum across {data.clientsContributing}{" "}
            {data.clientsContributing === 1 ? "client" : "clients"} with GA4
            connected — last 28 days, organic search only.
          </p>
        </div>
      </header>

      <div className="relative grid gap-6 p-5 lg:grid-cols-[1fr_1.4fr]">
        {/* Totals */}
        <div className="space-y-4">
          <Metric
            label="Sessions (28d)"
            value={data.totalSessions}
            delta={data.deltaPct}
            big
          />
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Users" value={data.totalUsers} />
            <Metric label="Pageviews" value={data.totalPageviews} />
          </div>
        </div>

        {/* Movers list */}
        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Biggest movers
          </div>
          <ul className="divide-y divide-white/[0.04]">
            {data.movers.map((m) => (
              <li
                key={m.clientId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <Link
                  href={`/clients/${m.clientId}`}
                  className="flex-1 truncate font-medium hover:underline"
                >
                  {m.clientName}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {m.recentSessions.toLocaleString()}
                  </span>
                  {typeof m.deltaPct === "number" && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                        m.deltaPct > 0
                          ? "bg-emerald-500/10 text-emerald-300"
                          : m.deltaPct < 0
                            ? "bg-rose-500/10 text-rose-300"
                            : "bg-white/5 text-muted-foreground",
                      )}
                    >
                      {m.deltaPct > 0 ? (
                        <TrendingUp className="size-3" />
                      ) : m.deltaPct < 0 ? (
                        <TrendingDown className="size-3" />
                      ) : null}
                      {m.deltaPct > 0 ? "+" : ""}
                      {m.deltaPct}%
                    </span>
                  )}
                  <ArrowUpRight className="size-3 text-muted-foreground/60" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Sparkline strip */}
      {data.daily.length > 1 && (
        <div className="relative px-5 pb-5">
          <Sparkline values={data.daily.map((d) => d.sessions)} />
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  delta,
  big,
}: {
  label: string;
  value: number;
  delta?: number | null;
  big?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-semibold tabular-nums",
          big
            ? "text-4xl text-gradient-cyan leading-none"
            : "text-2xl text-foreground",
        )}
      >
        {value.toLocaleString()}
      </div>
      {typeof delta === "number" && (
        <div
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            delta > 0
              ? "bg-emerald-500/10 text-emerald-300"
              : delta < 0
                ? "bg-rose-500/10 text-rose-300"
                : "bg-white/5 text-muted-foreground",
          )}
        >
          {delta > 0 ? (
            <TrendingUp className="size-3" />
          ) : delta < 0 ? (
            <TrendingDown className="size-3" />
          ) : null}
          {delta > 0 ? "+" : ""}
          {delta}% vs prior
        </div>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 600;
  const h = 50;
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
      className="h-12 w-full"
    >
      <defs>
        <linearGradient id="port-fill" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            stopColor="oklch(0.74 0.18 200)"
            stopOpacity="0.4"
          />
          <stop
            offset="100%"
            stopColor="oklch(0.74 0.18 200)"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill="url(#port-fill)" />
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
