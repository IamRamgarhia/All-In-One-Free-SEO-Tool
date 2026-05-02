"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runAiCheck, runAllAiChecks } from "./actions";

export function CheckOneButton({ keywordId }: { keywordId: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        className="h-7 border-fuchsia-500/30 bg-fuchsia-500/10 px-2 text-fuchsia-200 hover:bg-fuchsia-500/20"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await runAiCheck(keywordId);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Sparkles className="size-3" />
        )}
        {pending ? "…" : "Check AI"}
      </Button>
      {error && (
        <span
          className="text-[10px] text-rose-300"
          title={error}
        >
          ✕
        </span>
      )}
    </div>
  );
}

export function CheckAllButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      className="shadow-lg shadow-fuchsia-500/25 ring-1 ring-inset ring-white/15"
      onClick={() => startTransition(() => runAllAiChecks())}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      {pending ? "Checking all keywords…" : "Check all keywords"}
    </Button>
  );
}
