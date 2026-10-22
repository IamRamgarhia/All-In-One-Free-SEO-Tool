"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2, Radar, Sparkles } from "lucide-react";
import { runSerpScan } from "./serp-actions";

export function ScanSerpButton({ keywordId }: { keywordId: number }) {
  const t = useTranslations("keywords.serp");
  const [pending, startTransition] = useTransition();
  const [hint, setHint] = useState<string | null>(null);

  function run() {
    setHint(null);
    startTransition(async () => {
      const r = await runSerpScan(keywordId);
      if (!r.ok) {
        setHint(r.error);
        setTimeout(() => setHint(null), 5000);
        return;
      }
      setHint(
        r.aiOverviewPresent
          ? t("aiOverviewPresent")
          : t("resultsCaptured", { count: r.topResults }),
      );
      setTimeout(() => setHint(null), 4000);
    });
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/15 hover:text-violet-300 disabled:opacity-50"
        title={t("scanTitle")}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Radar className="size-3.5" />
        )}
      </button>
      <Link
        href={`/keywords/${keywordId}/serp`}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        title={t("viewLatest")}
      >
        <Sparkles className="size-3.5" />
      </Link>
      {hint && (
        <span className="ml-1 hidden text-[11px] text-violet-300 sm:inline">
          {hint}
        </span>
      )}
    </div>
  );
}
