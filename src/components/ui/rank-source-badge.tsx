/**
 * Says where a ranking number came from, and how much to trust it.
 *
 * This is not decoration. The two sources measure different things:
 *
 *   Search Console — the average position real users saw on a given day,
 *                    from Google, lagging two to three days
 *   Live check     — the position one datacentre IP was shown just now
 *
 * A tracker that showed both as a bare "#7" would invent movement every
 * time a keyword crossed from one to the other, and the user would go
 * looking for a ranking change that never happened. CLAUDE.md's standing
 * rule after the August audit is that a number shown to a user needs
 * provenance: where it came from, how fresh, how confident. This is that,
 * for rankings.
 */

import { Database, Globe } from "lucide-react";
import { useTranslations } from "next-intl";

export function RankSourceBadge({
  source,
  dataDate,
  impressions,
  className,
}: {
  source: "gsc" | "scrape" | "api" | null | undefined;
  /** The day a GSC figure describes — not the day it was fetched. */
  dataDate?: string | null;
  impressions?: number | null;
  className?: string;
}) {
  const t = useTranslations("rankSource");
  if (!source) return null;

  if (source === "gsc") {
    const n = impressions ?? 0;
    // Thresholds match rankConfidence() in rank-gsc.ts. An average built
    // on four impressions is a rumour, and saying so is more useful than
    // a confident-looking number.
    const thin = n < 15;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
          thin
            ? "bg-amber-500/10 text-amber-300 ring-amber-500/25"
            : "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25"
        } ${className ?? ""}`}
        title={
          t("gsc.base") +
          (dataDate ? t("gsc.on", { date: dataDate }) : "") +
          (n ? t("gsc.across", { count: n }) : t("gsc.end")) +
          (thin ? t("gsc.thin") : "") +
          t("gsc.lag")
        }
      >
        <Database className="size-2.5" />
        {t("gsc.label")}
      </span>
    );
  }

  if (source === "api") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 ring-1 ring-inset ring-sky-500/25 ${className ?? ""}`}
        title={t("api.title")}
      >
        <Globe className="size-2.5" />
        {t("api.label")}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10 ${className ?? ""}`}
      title={t("live.title")}
    >
      <Globe className="size-2.5" />
      {t("live.label")}
    </span>
  );
}

/**
 * The nudge shown above the keyword table when a client hasn't connected
 * Search Console. Deliberately states the concrete benefit rather than
 * "connect your account" — the reason to do it is better data, not
 * completeness for its own sake.
 */
export function ConnectGscNudge({ clientId }: { clientId: number }) {
  const t = useTranslations("rankSource.nudge");
  return (
    <div className="rounded-lg bg-violet-500/10 px-3 py-2 text-xs ring-1 ring-inset ring-violet-500/25">
      <span className="font-medium text-violet-200">{t("lead")}</span>{" "}
      <span className="text-muted-foreground">{t("body")} </span>
      {/* Google is connected in the project's settings tab (project-settings.tsx). */}
      <a
        href={`/clients/${clientId}?tab=settings`}
        className="font-medium underline underline-offset-2"
      >
        {t("cta")}
      </a>
    </div>
  );
}
