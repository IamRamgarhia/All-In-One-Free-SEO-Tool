"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Activity, Loader2, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkRankAction, checkAllRanksAction } from "./rank-actions";

export function CheckRankButton({ keywordId }: { keywordId: number }) {
  const t = useTranslations("keywords");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  return (
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
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Activity className="size-3" />
        )}
        {pending ? "…" : t("check")}
      </Button>
      <button
        type="button"
        onClick={() =>
          setDevice((d) => (d === "desktop" ? "mobile" : "desktop"))
        }
        title={t("switchDeviceTitle", { device: t(`device.${device}`) })}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
      >
        {device === "mobile" ? (
          <Smartphone className="size-3" />
        ) : (
          <Monitor className="size-3" />
        )}
      </button>
      {error && (
        <span className="text-[10px] text-rose-300" title={error}>
          ✕
        </span>
      )}
    </div>
  );
}

export function CheckAllRanksButton() {
  const t = useTranslations("keywords");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      className="shadow-lg shadow-violet-500/25 ring-1 ring-inset ring-white/15"
      onClick={() => {
        startTransition(async () => {
          await checkAllRanksAction();
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
  );
}
