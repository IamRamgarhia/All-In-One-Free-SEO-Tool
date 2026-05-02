import { cn } from "@/lib/utils";

type ScoreGaugeProps = {
  score: number | null;
  size?: number;
  className?: string;
  label?: string;
};

function scoreColor(score: number | null) {
  if (score === null) return { stroke: "#3a3f51", text: "text-muted-foreground" };
  if (score >= 80) return { stroke: "url(#gauge-green)", text: "text-gradient-emerald" };
  if (score >= 50) return { stroke: "url(#gauge-amber)", text: "text-gradient-amber" };
  return { stroke: "url(#gauge-rose)", text: "text-gradient-rose" };
}

export function ScoreGauge({
  score,
  size = 156,
  className,
  label = "Health score",
}: ScoreGaugeProps) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const value = score ?? 0;
  const offset = circumference - (value / 100) * circumference;
  const colors = scoreColor(score);

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="gauge-green" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.85 0.18 160)" />
            <stop offset="100%" stopColor="oklch(0.65 0.2 155)" />
          </linearGradient>
          <linearGradient id="gauge-amber" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.86 0.18 75)" />
            <stop offset="100%" stopColor="oklch(0.7 0.21 50)" />
          </linearGradient>
          <linearGradient id="gauge-rose" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.85 0.16 20)" />
            <stop offset="100%" stopColor="oklch(0.66 0.24 15)" />
          </linearGradient>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="oklch(1 0 0 / 0.06)"
          strokeWidth="10"
          fill="none"
        />
        {score !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.stroke}
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={cn(
            "text-[40px] font-semibold leading-none tracking-tight",
            colors.text,
          )}
        >
          {score ?? "—"}
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}
