import { cn } from "@/lib/utils";
import { ArrowDown, ArrowRight, ArrowUp, type LucideIcon } from "lucide-react";

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

const accentMap: Record<
  Accent,
  {
    glow: string;
    text: string;
    iconBg: string;
    iconText: string;
    spark: string;
    border: string;
  }
> = {
  violet: {
    glow: "from-violet-500/30 via-violet-500/5 to-transparent",
    text: "text-gradient-violet",
    iconBg: "bg-violet-500/15 ring-violet-400/30",
    iconText: "text-violet-300",
    spark: "stroke-violet-400 fill-violet-500/20",
    border: "before:[background:linear-gradient(135deg,oklch(0.69_0.18_268_/_0.5),oklch(1_0_0_/_0.05)_50%,oklch(0.69_0.18_268_/_0.2))]",
  },
  cyan: {
    glow: "from-cyan-500/30 via-cyan-500/5 to-transparent",
    text: "text-gradient-cyan",
    iconBg: "bg-cyan-500/15 ring-cyan-400/30",
    iconText: "text-cyan-300",
    spark: "stroke-cyan-400 fill-cyan-500/20",
    border: "before:[background:linear-gradient(135deg,oklch(0.74_0.18_200_/_0.5),oklch(1_0_0_/_0.05)_50%,oklch(0.74_0.18_200_/_0.2))]",
  },
  amber: {
    glow: "from-amber-500/30 via-amber-500/5 to-transparent",
    text: "text-gradient-amber",
    iconBg: "bg-amber-500/15 ring-amber-400/30",
    iconText: "text-amber-300",
    spark: "stroke-amber-400 fill-amber-500/20",
    border: "before:[background:linear-gradient(135deg,oklch(0.78_0.18_75_/_0.5),oklch(1_0_0_/_0.05)_50%,oklch(0.78_0.18_75_/_0.2))]",
  },
  rose: {
    glow: "from-rose-500/30 via-rose-500/5 to-transparent",
    text: "text-gradient-rose",
    iconBg: "bg-rose-500/15 ring-rose-400/30",
    iconText: "text-rose-300",
    spark: "stroke-rose-400 fill-rose-500/20",
    border: "before:[background:linear-gradient(135deg,oklch(0.7_0.21_25_/_0.5),oklch(1_0_0_/_0.05)_50%,oklch(0.7_0.21_25_/_0.2))]",
  },
  emerald: {
    glow: "from-emerald-500/30 via-emerald-500/5 to-transparent",
    text: "text-gradient-emerald",
    iconBg: "bg-emerald-500/15 ring-emerald-400/30",
    iconText: "text-emerald-300",
    spark: "stroke-emerald-400 fill-emerald-500/20",
    border: "before:[background:linear-gradient(135deg,oklch(0.7_0.2_155_/_0.5),oklch(1_0_0_/_0.05)_50%,oklch(0.7_0.2_155_/_0.2))]",
  },
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
}: StatCardProps) {
  const a = accentMap[accent];
  const padding = size === "hero" ? "p-6" : size === "compact" ? "p-4" : "p-5";
  const valueSize =
    size === "hero"
      ? "text-6xl"
      : size === "compact"
        ? "text-3xl"
        : "text-5xl";
  const iconBox = size === "compact" ? "size-8" : "size-9";
  const deltaIcon =
    delta === undefined ? null : delta.value > 0 ? ArrowUp : delta.value < 0 ? ArrowDown : ArrowRight;
  const deltaTone =
    delta === undefined
      ? ""
      : delta.value > 0
        ? "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20"
        : delta.value < 0
          ? "text-rose-400 bg-rose-500/10 ring-rose-500/20"
          : "text-muted-foreground bg-muted ring-border";

  return (
    <div
      className={cn(
        "glass-apple lift-on-hover group relative isolate overflow-hidden rounded-2xl",
        padding,
        className,
      )}
    >
      {/* glow blob */}
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-gradient-to-br opacity-80 blur-3xl transition-opacity group-hover:opacity-100",
          a.glow,
        )}
      />
      {/* Top inner highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

      <div className="relative z-10 flex items-start justify-between gap-3">
        {Icon && (
          <div
            className={cn(
              "flex items-center justify-center rounded-xl ring-1",
              iconBox,
              a.iconBg,
            )}
          >
            <Icon className={cn("size-4", a.iconText)} />
          </div>
        )}
        {delta !== undefined && deltaIcon && (
          <div
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
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
          </div>
        )}
      </div>

      <div className="relative z-10 mt-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-1 font-semibold leading-none tracking-tight",
            valueSize,
            a.text,
          )}
        >
          {value}
        </div>
        {hint && (
          <div className="mt-2 text-xs text-muted-foreground">{hint}</div>
        )}
      </div>

      {spark && spark.length > 1 && (
        <div className="relative z-10 mt-4">
          <Sparkline values={spark} className={a.spark} />
        </div>
      )}
    </div>
  );
}
