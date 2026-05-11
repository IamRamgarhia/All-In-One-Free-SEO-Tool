import { cn } from "@/lib/utils";
import { ArrowDown, ArrowRight, ArrowUp, type LucideIcon } from "lucide-react";
import { CountUp } from "./count-up";

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
  /** "hero" gets larger numerals + extra padding to anchor a stats row. */
  size?: "default" | "hero" | "compact";
};

const accentIcon: Record<Accent, string> = {
  violet: "text-violet-300",
  cyan: "text-cyan-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  emerald: "text-emerald-300",
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
  const h = 24;
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
      className={cn("h-6 w-full", className)}
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
}: StatCardProps) {
  const padding = size === "hero" ? "p-5" : size === "compact" ? "p-3" : "p-4";
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
        ? "text-emerald-300"
        : delta.value < 0
          ? "text-rose-300"
          : "text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card transition-colors hover:border-border/80",
        padding,
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        {Icon && <Icon className={cn("size-3.5", accentIcon[accent])} />}
        <span className="truncate">{label}</span>
        {delta !== undefined && deltaIcon && (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
              deltaTone,
            )}
          >
            {(() => {
              const I = deltaIcon;
              return <I className="size-3" />;
            })()}
            {delta.value > 0 ? "+" : ""}
            {delta.value}
            {delta.label ? ` ${delta.label}` : ""}
          </span>
        )}
      </div>

      <div
        className={cn(
          "mt-1.5 font-semibold leading-tight tracking-tight tabular-nums text-foreground",
          valueSize,
        )}
      >
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      )}

      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline values={spark} className={accentSpark[accent]} />
        </div>
      )}
    </div>
  );
}
