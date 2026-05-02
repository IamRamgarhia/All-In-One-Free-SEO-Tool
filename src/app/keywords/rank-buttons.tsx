"use client";

import { useState, useTransition } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkRankAction, checkAllRanksAction } from "./rank-actions";

export function CheckRankButton({ keywordId }: { keywordId: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
            const r = await checkRankAction(keywordId);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Activity className="size-3" />
        )}
        {pending ? "…" : "Check"}
      </Button>
      {error && (
        <span className="text-[10px] text-rose-300" title={error}>
          ✕
        </span>
      )}
    </div>
  );
}

export function CheckAllRanksButton() {
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
      {pending ? "Checking ranks…" : "Check all ranks"}
    </Button>
  );
}
