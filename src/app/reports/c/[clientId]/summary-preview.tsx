"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { previewExecSummary } from "./preview-actions";
import { AiFeedback } from "@/components/ai-feedback";

export function SummaryPreview({ clientId }: { clientId: number }) {
  const [, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="size-4 text-violet-300" />
          Executive summary preview
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Generate the AI exec summary and read it before sending the
          report. Thumbs-up / thumbs-down feeds the learning loop.
        </p>
      </header>
      <div className="p-5">
        {summary ? (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm text-foreground/95">
              {summary}
            </p>
            <div className="flex items-center justify-between gap-3">
              <AiFeedback
                feature="exec_summary"
                aiOutput={summary}
                clientId={clientId}
              />
              <button
                type="button"
                onClick={() => {
                  setGenerating(true);
                  setError(null);
                  startTransition(async () => {
                    const r = await previewExecSummary(clientId);
                    setGenerating(false);
                    if (r.ok) setSummary(r.summary);
                    else setError(r.error);
                  });
                }}
                disabled={generating}
                className="inline-flex items-center gap-1 rounded-md bg-white/5 px-3 py-1 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Regenerating…
                  </>
                ) : (
                  "Regenerate"
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setGenerating(true);
              setError(null);
              startTransition(async () => {
                const r = await previewExecSummary(clientId);
                setGenerating(false);
                if (r.ok) setSummary(r.summary);
                else setError(r.error);
              });
            }}
            disabled={generating}
            className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Generating…
              </>
            ) : (
              "Generate exec summary"
            )}
          </button>
        )}
        {error && (
          <p className="mt-2 text-xs text-rose-300">{error}</p>
        )}
      </div>
    </section>
  );
}
