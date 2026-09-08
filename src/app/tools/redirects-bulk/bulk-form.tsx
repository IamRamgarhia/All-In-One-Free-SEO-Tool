"use client";

import { useActionState } from "react";
import { CornerDownRight, Loader2 } from "lucide-react";
import { runBulk, type BulkState } from "./actions";
import { ClientIdField } from "@/components/client-id-field";

export function BulkRedirectForm() {
  const [state, formAction, pending] = useActionState<
    BulkState | null,
    FormData
  >(runBulk, null);

  function statusTone(s: number) {
    if (s >= 200 && s < 300) return "text-emerald-300";
    if (s >= 300 && s < 400) return "text-amber-300";
    if (s >= 400) return "text-rose-300";
    return "text-muted-foreground";
  }

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <ClientIdField />
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">URLs (one per line, max 100)</span>
          <textarea
            name="urls"
            required
            rows={8}
            spellCheck={false}
            placeholder={"https://example.com/old-page\nhttps://example.com/another-old\nhttps://www.example.com"}
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
              Tracing chains…
            </>
          ) : (
            <>
              <CornerDownRight className="mr-2 size-4" />
              Trace
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && state.chains.length > 0 && (
        <div className="space-y-3">
          {state.chains.map((c) => (
            <section
              key={c.startUrl}
              className="glass-apple relative overflow-hidden rounded-2xl"
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
                <div className="min-w-0 flex-1">
                  <code className="block truncate text-xs font-medium">
                    {c.startUrl}
                  </code>
                  <code className="block truncate text-[10px] text-muted-foreground">
                    → {c.finalUrl}
                  </code>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-[10px]">
                  <span className={`rounded-md bg-white/5 px-1.5 py-0.5 ring-1 ring-inset ring-white/10 ${statusTone(c.finalStatus)}`}>
                    final {c.finalStatus || "ERR"}
                  </span>
                  <span className={`rounded-md bg-white/5 px-1.5 py-0.5 ring-1 ring-inset ring-white/10 ${c.hopCount >= 4 ? "text-rose-300" : c.hopCount >= 2 ? "text-amber-300" : "text-muted-foreground"}`}>
                    {c.hopCount} hops
                  </span>
                  {c.hadLoop && (
                    <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-300 ring-1 ring-inset ring-rose-500/30">
                      loop
                    </span>
                  )}
                  {c.hadMixedScheme && (
                    <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-300 ring-1 ring-inset ring-amber-500/30">
                      http↔https
                    </span>
                  )}
                  <span className="text-muted-foreground">{c.totalLatencyMs}ms</span>
                </div>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {c.hops.map((h, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-2 text-xs">
                    <span className={`shrink-0 font-mono ${statusTone(h.status)}`}>
                      {h.status || "ERR"}
                    </span>
                    <code className="min-w-0 flex-1 truncate">{h.url}</code>
                    {h.location && (
                      <code className="shrink-0 text-muted-foreground truncate max-w-[40%]">
                        → {h.location}
                      </code>
                    )}
                  </li>
                ))}
                {c.error && (
                  <li className="px-5 py-2 text-xs text-rose-300">
                    Error: {c.error}
                  </li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
