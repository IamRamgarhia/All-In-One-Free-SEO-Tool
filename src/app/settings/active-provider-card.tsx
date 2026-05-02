"use client";

import { useTransition } from "react";
import { Loader2, Sparkles, Check } from "lucide-react";
import {
  PROVIDER_CATALOG,
  type Provider,
} from "@/lib/api-providers";
import { setActiveProvider } from "./key-actions";

const tierTone: Record<"free" | "free-tier" | "paid", string> = {
  free: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  "free-tier": "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  paid: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

export function ActiveProviderCard({
  active,
  configured,
}: {
  active: string | null;
  configured: Record<string, boolean>;
}) {
  const [pending, startTransition] = useTransition();

  const configuredCount = Object.values(configured).filter(Boolean).length;

  if (configuredCount === 0) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
        Configure at least one provider below — then you can pick one as the
        active model that all AI features (executive summary, chat assistant,
        OCR extraction) will use.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] backdrop-blur">
      <header className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <div className="flex size-7 items-center justify-center rounded-md bg-violet-500/15 ring-1 ring-violet-400/30">
          <Sparkles className="size-3.5 text-violet-300" />
        </div>
        <div>
          <div className="text-sm font-semibold">Active AI provider</div>
          <p className="text-[11px] text-muted-foreground">
            All AI features in this app use this one model — exec summaries,
            the AI assistant, and OCR extraction. AI visibility tracking is
            the exception (it intentionally calls every configured provider).
          </p>
        </div>
        {pending && (
          <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />
        )}
      </header>
      <div className="grid gap-2 p-3 md:grid-cols-2 lg:grid-cols-3">
        {PROVIDER_CATALOG.map((p) => {
          const isOn = configured[p.id];
          const isActive = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={!isOn || pending}
              onClick={() =>
                startTransition(() =>
                  setActiveProvider(p.id as Provider | "ollama"),
                )
              }
              className={
                isActive
                  ? "flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/15 px-3 py-2.5 text-left text-sm ring-1 ring-inset ring-violet-500/30"
                  : isOn
                    ? "flex items-center gap-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2.5 text-left text-sm transition-colors hover:border-violet-500/30 hover:bg-white/[0.04]"
                    : "flex items-center gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-left text-sm opacity-40"
              }
              title={
                !isOn
                  ? "Configure this provider's key first (below)"
                  : isActive
                    ? "Currently the active provider"
                    : `Switch to ${p.label}`
              }
            >
              <span
                className={
                  isActive
                    ? "grid size-4 shrink-0 place-items-center rounded-full bg-violet-500 text-violet-50"
                    : "size-4 shrink-0 rounded-full border border-white/15"
                }
              >
                {isActive && <Check className="size-3" />}
              </span>
              <span className="flex-1 font-medium">{p.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider ring-1 ring-inset ${tierTone[p.tier]}`}
              >
                {p.tier === "free"
                  ? "FREE"
                  : p.tier === "free-tier"
                    ? "FREE TIER"
                    : "PAID"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
