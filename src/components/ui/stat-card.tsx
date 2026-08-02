import { cn } from "@/lib/utils";
import { ArrowDown, ArrowRight, ArrowUp, type LucideIcon } from "lucide-react";
import { CountUp } from "./count-up";
import { DataSourceBadge, type DataSource } from "./data-source-badge";

/**
 * shadcn-admin-style stat card.
 *
 * Layout: title row (label + small icon on the right) → big tabular
 * value → delta pill on the same line as the hint → optional spark
 * underneath. Matches the dashboard cards on shadcn-admin.netlify.app.
 */

type Accent = "violet" | "cyan" | "amber" | "rose" | "emerald";

type StatCardProps = {
  label: string;
  value: number | string;
  hint?: React.ReactNode;
  accent?: Accent;
  icon?: LucideIcon;
  delta?: { value: number; label?: string };
  spark?: number[];
  className?: string;
  size?: "default" | "hero" | "compact";
  /**
   * Where the number came from.
   *
   * Optional, but the absence should be deliberate rather than
   * forgotten: a card showing a count of rows in our own database
   * doesn't need provenance, while one showing traffic or a score very
   * much does. See components/ui/data-source-badge.tsx.
   */
  source?: DataSource;
  /** The date the figure DESCRIBES, not when it was fetched. */
  asOf?: string | Date | null;
  /** Extra tooltip context, e.g. "across 1,204 impressions". */
  sourceNote?: string;
};

const accentText: Record<Accent, string> = {
  violet: "text-violet-500 dark:text-violet-400",
  cyan: "text-cyan-500 dark:text-cyan-400",
  amber: "text-amber-500 dark:text-amber-400",
  rose: "text-rose-500 dark:text-rose-400",
  emerald: "text-emerald-500 dark:text-emerald-400",
};

const accentSpark: Record<Accent, string> = {
  violet: "stroke-violet-400 fill-violet-500/10",
  cyan: "stroke-cyan-400 fill-cyan-500/10",
  amber: "stroke-amber-400 fill-amber-500/10",
  rose: "stroke-rose-400 fill-rose-500/10",
  emerald: "stroke-emerald-400 fill-emerald-500/10",
};

function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
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
      className={cn("h-7 w-full", className)}
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        strokeWidth="0"
        className="opacity-50"
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "violet",
  icon: Icon,
  delta,
  spark,
  className,
  size = "default",
  source,
  asOf,
  sourceNote,
}: StatCardProps) {
  const padding = size === "hero" ? "p-6" : size === "compact" ? "p-3" : "p-6";
  const valueSize =
    size === "hero"
      ? "text-3xl"
      : size === "compact"
        ? "text-xl"
        : "text-2xl";
  const deltaIcon =
    delta === undefined
      ? null
      : delta.value > 0
        ? ArrowUp
        : delta.value < 0
          ? ArrowDown
          : ArrowRight;
  const deltaTone =
    delta === undefined
      ? ""
      : delta.value > 0
        ? "text-emerald-500 dark:text-emerald-400"
        : delta.value < 0
          ? "text-rose-500 dark:text-rose-400"
          : "text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow",
        padding,
        className,
      )}
    >
      <div className="flex items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium tracking-tight text-muted-foreground">
          {label}
        </h3>
        {Icon && (
          <Icon className={cn("h-4 w-4", accentText[accent])} />
        )}
      </div>
      <div
        className={cn(
          "font-bold tabular-nums tracking-tight text-foreground",
          valueSize,
        )}
      >
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {delta !== undefined && deltaIcon && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium tabular-nums",
              deltaTone,
            )}
          >
            {(() => {
              const I = deltaIcon;
              return <I className="h-3 w-3" />;
            })()}
            {delta.value > 0 ? "+" : ""}
            {delta.value}
            {delta.label ? ` ${delta.label}` : ""}
          </span>
        )}
        {hint && <span className="truncate">{hint}</span>}
        {source && (
          <DataSourceBadge source={source} asOf={asOf} note={sourceNote} />
        )}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline values={spark} className={accentSpark[accent]} />
        </div>
      )}
    </div>
  );
}
