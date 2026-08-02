"use client";

import { useActionState } from "react";
import { Compass, Loader2 } from "lucide-react";
import { AiFailureNotice } from "@/components/ui/ai-failure-notice";
import { runClassify, type IntentState } from "./actions";

const TONE: Record<string, string> = {
  informational: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  commercial: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  transactional: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  navigational: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  local: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export function IntentForm() {
  const [state, formAction, pending] = useActionState<
    IntentState | null,
    FormData
  >(runClassify, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Queries (one per line, max 200)</span>
          <textarea
            name="queries"
            required
            rows={10}
            spellCheck={false}
            placeholder={"how to wash a wool sweater\nbest electric scooter for adults\nbuy nike air max\nplumber near me\nyoutube"}
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 font-mono text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-cyan-500/15 px-5 text-sm font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Classifying…
            </>
          ) : (
            <>
              <Compass className="mr-2 size-4" />
              Classify
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {/* The AI step failed but the tool still produced something — here,
          a regex fallback classified the queries. Without this the user
          gets the weaker result silently and has no idea a better one was
          attempted, or why it didn't happen. */}
      {state?.ok && state.aiFailure && (
        <AiFailureNotice failure={state.aiFailure} />
      )}

      {state?.ok && state.rows.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Query</th>
                  <th className="px-4 py-2 text-left">Intent</th>
                  <th className="px-4 py-2 text-right">Conf.</th>
                  <th className="px-4 py-2 text-left">Recommended format</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r, i) => (
                  <tr key={i} className="border-t border-white/[0.04]">
                    <td className="px-4 py-1.5 font-medium">{r.query}</td>
                    <td className="px-4 py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${TONE[r.intent]}`}
                      >
                        {r.intent}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                      {(r.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-1.5 text-muted-foreground">
                      {r.recommendedFormat}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
