"use client";

import { useActionState } from "react";
import { GitMerge, Loader2 } from "lucide-react";
import { runCanonical, type CanonState } from "./actions";
import { ClientIdField } from "@/components/client-id-field";

const KIND_TONE: Record<string, string> = {
  missing: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  "off-host": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  "broken-target": "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  "redirect-target": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  "self-mismatch": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  multiple: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  "noindex-conflict": "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export function CanonForm() {
  const [state, formAction, pending] = useActionState<
    CanonState | null,
    FormData
  >(runCanonical, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <ClientIdField />
        <div className="grid gap-3 md:grid-cols-[1fr_120px_140px]">
          <input
            name="startUrl"
            required
            placeholder="https://yoursite.com"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <input
            type="number"
            name="maxPages"
            defaultValue={80}
            min={20}
            max={200}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-amber-500/15 px-4 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Crawling…
              </>
            ) : (
              <>
                <GitMerge className="mr-2 size-3" />
                Audit
              </>
            )}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Stat label="Pages crawled" value={state.result.pagesChecked.toString()} />
            <Stat label="Issues" value={state.result.issues.length.toString()} tone={state.result.issues.length === 0 ? "emerald" : "amber"} />
            <Stat label="Critical" value={String(state.result.summary["broken-target"] ?? 0 + (state.result.summary["multiple"] ?? 0) + (state.result.summary["noindex-conflict"] ?? 0))} tone="rose" />
            <Stat label="Self-mismatch" value={(state.result.summary["self-mismatch"] ?? 0).toString()} tone="amber" />
          </div>

          {state.result.issues.length === 0 ? (
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              ✓ No canonical issues detected on the first {state.result.pagesChecked} pages.
            </p>
          ) : (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">{state.result.issues.length} issues</h3>
              </header>
              <ul className="divide-y divide-white/[0.05]">
                {state.result.issues.map((i, idx) => (
                  <li key={idx} className="px-5 py-3 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${KIND_TONE[i.kind]}`}
                      >
                        {i.kind}
                      </span>
                      <span
                        className={`text-[10px] font-medium ${
                          i.severity === "critical"
                            ? "text-rose-300"
                            : i.severity === "high"
                              ? "text-amber-300"
                              : "text-cyan-300"
                        }`}
                      >
                        {i.severity}
                      </span>
                    </div>
                    <code className="block truncate">{i.url}</code>
                    {i.canonicalUrl && (
                      <code className="block truncate text-muted-foreground">
                        ↪ canonical: {i.canonicalUrl}
                      </code>
                    )}
                    <p className="text-muted-foreground">{i.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "rose";
}) {
  const t = tone
    ? { emerald: "text-emerald-300", amber: "text-amber-300", rose: "text-rose-300" }[tone]
    : "";
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t}`}>{value}</div>
    </div>
  );
}
