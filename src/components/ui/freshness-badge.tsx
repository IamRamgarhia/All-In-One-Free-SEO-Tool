import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { shortAgo } from "@/lib/relative-time";

/**
 * Tiny pill that shows how stale a piece of data is. Use anywhere a
 * chart / table / panel is sourced from a periodic sync (GSC, GA4,
 * rank-check, audit run) so the user knows whether they're looking at
 * something live or 3-day-old cached numbers.
 *
 * Color tiers:
 *   - emerald: ≤ 1 hour old (live-ish)
 *   - neutral: ≤ 24 hours old (today)
 *   - amber:   ≤ 7 days old (this week)
 *   - red:     > 7 days old (stale — likely the user disconnected
 *              an integration or the runner stalled)
 *
 * The tooltip carries the absolute timestamp so a pro can still see
 * the exact second.
 *
 * Usage:
 *   <FreshnessBadge capturedAt={chart.lastSyncedAt} source="GSC" />
 *
 * If `capturedAt` is null/undefined the badge renders "no data" in
 * neutral — handy for empty-table headers.
 */
export function FreshnessBadge({
  capturedAt,
  source,
  className,
}: {
  capturedAt: Date | string | number | null | undefined;
  /** Optional source name (e.g. "GSC", "GA4", "Rank check"). Shows in the tooltip. */
  source?: string;
  className?: string;
}) {
  const tx = useTranslations("ui.components_ui_freshness-badge");
  const tTime = useTranslations("time");
  const locale = useLocale();
  if (capturedAt === null || capturedAt === undefined) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border",
          className,
        )}
        title={source ? tx("noDataYetSource", { source }) : tx("noDataYet")}
      >
        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
        {tx("noDataYet")}
      </span>
    );
  }

  const date =
    capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  const ms = Date.now() - date.getTime();
  const label = shortAgo(ms, tTime, { seconds: true });
  const tier = tierFor(ms);
  const tierCls = {
    fresh: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
    today: "bg-muted text-muted-foreground ring-border",
    week: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
    stale: "bg-red-500/10 text-red-300 ring-red-500/30",
  }[tier];
  const dotCls = {
    fresh: "bg-emerald-400",
    today: "bg-muted-foreground/50",
    week: "bg-amber-400",
    stale: "bg-red-400",
  }[tier];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset tabular-nums",
        tierCls,
        className,
      )}
      title={
        source
          ? tx("capturedSource", { source, when: date.toLocaleString(locale) })
          : tx("captured", { when: date.toLocaleString(locale) })
      }
    >
      <span className={cn("size-1.5 rounded-full", dotCls)} />
      {label}
    </span>
  );
}

function tierFor(ms: number): "fresh" | "today" | "week" | "stale" {
  const HOUR = 3_600_000;
  const DAY = HOUR * 24;
  if (ms <= HOUR) return "fresh";
  if (ms <= DAY) return "today";
  if (ms <= DAY * 7) return "week";
  return "stale";
}
