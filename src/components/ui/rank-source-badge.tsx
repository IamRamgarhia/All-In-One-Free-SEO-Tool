/**
 * Says where a ranking number came from, and how much to trust it.
 *
 * This is not decoration. The sources measure different things:
 *
 *   Search Console — the average position real users saw on a given day,
 *                    from Google, lagging two to three days
 *   SearXNG        — the merged ranking of the engines a metasearch
 *                    instance queried, just now
 *   Brave          — Brave's own index, not Google's
 *   Google (API / browser) — one Google results page, just now
 *   DuckDuckGo     — DuckDuckGo's first page, about ten results
 *
 * A tracker that showed both as a bare "#7" would invent movement every
 * time a keyword crossed from one to the other, and the user would go
 * looking for a ranking change that never happened. CLAUDE.md's standing
 * rule after the August audit is that a number shown to a user needs
 * provenance: where it came from, how fresh, how confident. This is that,
 * for rankings.
 */

import { Database, Globe, Layers, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { isRankSource, type RankSource } from "@/lib/serp/sources";

const PILL =
  "inline-flex max-w-full items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset";

export function RankSourceBadge({
  source,
  engine,
  dataDate,
  impressions,
  className,
}: {
  source: RankSource | string | null | undefined;
  /**
   * The engine(s) behind the number, from keyword_rankings.engine. Null on
   * rows written before it was recorded.
   */
  engine?: string | null;
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
        className={`${PILL} ${
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
        <Database className="size-2.5 shrink-0" />
        {t("gsc.label")}
      </span>
    );
  }

  if (source === "api") {
    return (
      <span
        className={`${PILL} bg-sky-500/10 text-sky-300 ring-sky-500/25 ${className ?? ""}`}
        title={t("api.title")}
      >
        <Globe className="size-2.5 shrink-0" />
        {t("api.label")}
      </span>
    );
  }

  // Everything else names the engine that answered. This used to be one
  // fallback branch reading "Live check" — which also covered DuckDuckGo
  // readings, so a DuckDuckGo page was presented as a Google position.
  const known = isRankSource(source) ? source : null;
  const Icon = known === "searxng" ? Layers : known === "brave" ? Shield : Globe;
  let label: string;
  let title: string;
  if (known === "searxng") {
    label = t("searxng.label");
    title = t("searxng.title", { engines: engine || t("searxng.enginesUnknown") });
  } else if (known === "brave") {
    label = t("brave.label");
    title = t("brave.title");
  } else if (known === "duckduckgo") {
    label = t("duckduckgo.label");
    title = t("duckduckgo.title");
  } else if (known === "scrape" && engine === "google") {
    label = t("google.label");
    title = t("google.title");
  } else if (known === "scrape") {
    // Written before the engine was recorded: Google or DuckDuckGo,
    // and nothing left to tell which.
    label = t("legacy.label");
    title = t("legacy.title");
  } else {
    label = String(source);
    title = t("unknown.title");
  }

  return (
    <span
      className={`${PILL} bg-white/5 text-muted-foreground ring-white/10 ${className ?? ""}`}
      title={title}
    >
      <Icon className="size-2.5 shrink-0" />
      {label}
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
