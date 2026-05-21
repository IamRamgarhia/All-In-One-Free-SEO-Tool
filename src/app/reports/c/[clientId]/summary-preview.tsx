"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { previewExecSummary } from "./preview-actions";
import { AiFeedback } from "@/components/ai-feedback";
import { AiDisclaimer } from "@/components/ai-disclaimer";

type DataPoint = { label: string; value: string };

export function SummaryPreview({ clientId }: { clientId: number }) {
  const [, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [source, setSource] = useState<"ai" | "template" | null>(null);
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
            {dataPoints.length > 0 && (
              <details className="rounded-md border border-white/[0.06] bg-white/[0.02] open:bg-white/[0.04]">
                <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  Data behind this summary ({dataPoints.length})
                  {source === "template" && (
                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-normal text-amber-300 ring-1 ring-inset ring-amber-500/30">
                      template fallback — no AI key configured
                    </span>
                  )}
                </summary>
                <ul className="space-y-1 border-t border-white/[0.06] px-3 py-2 text-[12px]">
                  {dataPoints.map((dp, i) => (
                    <li key={i} className="flex gap-2 leading-relaxed">
                      <span className="shrink-0 font-medium text-muted-foreground">
                        {dp.label}:
                      </span>
                      <span className="text-foreground/90">{dp.value}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <AiFeedback
                  feature="exec_summary"
                  aiOutput={summary}
                  clientId={clientId}
                />
                <AiDisclaimer variant="inline" />
              </div>
              <button
                type="button"
                onClick={() => {
                  setGenerating(true);
                  setError(null);
                  startTransition(async () => {
                    const r = await previewExecSummary(clientId);
                    setGenerating(false);
                    if (r.ok) {
                      setSummary(r.summary);
                      setDataPoints(r.dataPoints);
                      setSource(r.source);
                    } else {
                      setError(r.error);
                    }
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
