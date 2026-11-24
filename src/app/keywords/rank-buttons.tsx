"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Activity, AlertTriangle, Loader2, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkRankAction, checkAllRanksAction, type RankBatchSummary } from "./rank-actions";
import { RANK_SOURCE_IDS } from "@/lib/serp/sources";

export function CheckRankButton({ keywordId }: { keywordId: number }) {
  const t = useTranslations("keywords");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          className="h-7 border-white/10 bg-white/5 px-2"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await checkRankAction(keywordId, device);
              if (!r.ok) setError(r.error);
            });
          }}
          title={t("checkRankTitle", { device: t(`device.${device}`) })}
          aria-label={t("checkRankTitle", { device: t(`device.${device}`) })}
        >
          {pending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Activity className="size-3" />
          )}
          {/* Icon only on a phone: the row also carries three more actions. */}
          <span className="hidden sm:inline">{pending ? "…" : t("check")}</span>
        </Button>
        <button
          type="button"
          onClick={() =>
            setDevice((d) => (d === "desktop" ? "mobile" : "desktop"))
          }
          title={t("switchDeviceTitle", { device: t(`device.${device}`) })}
          aria-label={t("switchDeviceTitle", { device: t(`device.${device}`) })}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
        >
          {device === "mobile" ? (
            <Smartphone className="size-3" />
          ) : (
            <Monitor className="size-3" />
          )}
        </button>
      </div>
      {/* The reason, written out: a bare "✕" with an English tooltip told
          nobody what happened or what to do. */}
      {error && (
        <p role="alert" className="max-w-[12rem] text-left text-[11px] leading-snug text-amber-200 sm:max-w-[16rem]">
          <span className="font-medium">{t("checkFailed")}</span> {error}
        </p>
      )}
    </div>
  );
}

/** "3 Search Console, 8 SearXNG, 1 DuckDuckGo" — in the chain's order. */
function sourcesLine(
  t: ReturnType<typeof useTranslations>,
  bySource: RankBatchSummary["bySource"],
): string {
  return RANK_SOURCE_IDS.filter((s) => (bySource[s] ?? 0) > 0)
    .map((s) => t("summarySource", { count: bySource[s] ?? 0, source: t(`sourceName.${s}`) }))
    .join(", ");
}

export function CheckAllRanksButton({ clientId }: { clientId?: number }) {
  const t = useTranslations("keywords");
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<RankBatchSummary | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        disabled={pending}
        className="shadow-lg shadow-violet-500/25 ring-1 ring-inset ring-white/15"
        onClick={() => {
          setSummary(null);
          setFailed(false);
          startTransition(async () => {
            try {
              setSummary(await checkAllRanksAction(clientId));
            } catch {
              setFailed(true);
            }
          });
        }}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        {pending ? t("checkingAll") : t("checkAll")}
      </Button>
      {pending && (
        <p className="max-w-xs text-right text-[11px] text-muted-foreground">{t("checkingAllHint")}</p>
      )}
      {failed && (
        <p role="alert" className="max-w-xs text-right text-[11px] text-amber-200">
          {t("summaryError")}
        </p>
      )}
      {summary && (
        // The run's own report. It used to be thrown away: the button
        // stopped spinning and nothing said whether 30 keywords had been
        // checked or 30 had been blocked.
        <div
          role="status"
          className="w-full max-w-sm rounded-lg bg-white/5 px-3 py-2 text-left text-[11px] leading-snug ring-1 ring-inset ring-white/10"
        >
          {summary.total === 0 ? (
            <p className="text-muted-foreground">{t("summaryNone")}</p>
          ) : (
            <>
              <p>
                <span className="font-medium text-foreground">
                  {t("summaryChecked", { checked: summary.checked, total: summary.total })}
                </span>
                {summary.checked > 0 && (
                  <span className="text-muted-foreground"> ({sourcesLine(t, summary.bySource)})</span>
                )}
              </p>
              {summary.failed > 0 && (
                <p className="mt-1 text-amber-200">{t("summaryFailed", { count: summary.failed })}</p>
              )}
              {summary.googleAbandoned && (
                <p className="mt-1 flex gap-1 text-amber-200/90">
                  <AlertTriangle className="mt-px size-3 shrink-0" />
                  <span>{t("summaryGoogleAbandoned")}</span>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
