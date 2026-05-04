"use client";

import { useActionState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { estimateVolumes, type EstimateState } from "./actions";
import { bucketLabel } from "@/lib/search-volume";

const BUCKET_TONE: Record<string, string> = {
  very_high: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  high: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  medium: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  low: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  very_low: "bg-white/5 text-muted-foreground ring-white/10",
};

export function VolumeForm() {
  const [state, formAction, pending] = useActionState<
    EstimateState | null,
    FormData
  >(estimateVolumes, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_120px]">
          <label className="space-y-1 text-xs md:col-span-1">
            <span className="text-muted-foreground">
              Keywords (one per line, max 30)
            </span>
            <textarea
              name="queries"
              required
              rows={8}
              placeholder={"vegan cookbooks\nbest meal planner\nbudget recipes for beginners"}
              className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs md:self-start">
            <span className="text-muted-foreground">Country</span>
            <input
              name="country"
              defaultValue="US"
              maxLength={4}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm uppercase focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-cyan-500/15 px-5 text-sm font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Probing signals…
            </>
          ) : (
            <>
              <TrendingUp className="mr-2 size-4" />
              Estimate
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">
              Estimates ({state.estimates.length})
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Bucket = relative monthly volume. Confidence reflects how many
              of the four signal sources we got data from.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 text-left font-medium">Keyword</th>
                  <th className="px-3 py-3 text-right font-medium">Bucket</th>
                  <th className="px-3 py-3 text-right font-medium">Trends</th>
                  <th className="px-3 py-3 text-right font-medium">G AC</th>
                  <th className="px-3 py-3 text-right font-medium">B AC</th>
                  <th className="px-3 py-3 text-right font-medium">Conf.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {state.estimates.map((e) => (
                  <tr key={e.query} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-2.5">
                      <div className="space-y-0.5">
                        <div className="font-medium">{e.query}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {e.rationale}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${BUCKET_TONE[e.bucket]}`}
                      >
                        {bucketLabel(e.bucket)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {e.signals.trendsScore !== null
                        ? `${e.signals.trendsScore}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">
                      {e.signals.googleAutocomplete ? "✓" : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">
                      {e.signals.bingAutocomplete ? "✓" : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {e.confidence}%
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
