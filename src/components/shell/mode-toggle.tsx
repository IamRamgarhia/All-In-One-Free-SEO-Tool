"use client";

import { useTransition } from "react";
import { GraduationCap, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { setUiMode } from "@/app/settings/ui-actions";

export function ModeToggle({ mode }: { mode: "guided" | "pro" }) {
  const [pending, startTransition] = useTransition();
  const t = useTranslations("common");

  return (
    <div className="hidden items-center gap-1 rounded-lg border border-white/10 bg-card/60 p-0.5 backdrop-blur sm:flex">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => setUiMode("guided"))}
        className={
          mode === "guided"
            ? "inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
            : "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
        }
        title={t("guidedTitle")}
      >
        <GraduationCap className="size-3" />
        <span className="hidden md:inline">{t("guided")}</span>
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => setUiMode("pro"))}
        className={
          mode === "pro"
            ? "inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-1 text-[11px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30"
            : "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
        }
        title={t("proTitle")}
      >
        <Zap className="size-3" />
        <span className="hidden md:inline">{t("pro")}</span>
      </button>
    </div>
  );
}
