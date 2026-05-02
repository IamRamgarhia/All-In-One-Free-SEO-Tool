"use client";

import { useTransition } from "react";
import { GraduationCap, Zap } from "lucide-react";
import { setUiMode } from "@/app/settings/ui-actions";

export function ModeToggle({ mode }: { mode: "guided" | "pro" }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-card/60 p-0.5 backdrop-blur">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => setUiMode("guided"))}
        className={
          mode === "guided"
            ? "inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
            : "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
        }
        title="Guided mode — explanations and beginner cues"
      >
        <GraduationCap className="size-3" />
        Guided
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
        title="Pro mode — dense data, no hand-holding"
      >
        <Zap className="size-3" />
        Pro
      </button>
    </div>
  );
}
