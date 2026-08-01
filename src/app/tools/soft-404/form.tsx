"use client";

import { useActionState } from "react";
import { Loader2, Unlink } from "lucide-react";
import { runSoft404, type SoftState } from "./actions";

const REASON_TONE: Record<string, string> = {
  "thin-content": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  "404-text-pattern": "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  "404-title-pattern": "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  "no-h1-thin": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

export function Soft404Form() {
  const [state, formAction, pending] = useActionState<SoftState | null, FormData>(
    runSoft404,
    null,
  );

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
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
            defaultValue={100}
            min={20}
            max={300}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-rose-500/15 px-4 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Crawling…
              </>
            ) : (
              <>
                <Unlink className="mr-2 size-3" />
                Find soft 404s
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
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Pages crawled" value={state.result.pagesChecked.toString()} />
            <Stat
              label="Soft-404 candidates"
              value={state.result.flagged.length.toString()}
              tone={state.result.flagged.length > 0 ? "rose" : "emerald"}
            />
            <Stat
              label="Status"
              value={state.result.flagged.length === 0 ? "Healthy" : "Needs review"}
              tone={state.result.flagged.length === 0 ? "emerald" : "amber"}
            />
          </div>

          {state.result.flagged.length === 0 ? (
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              ✓ No soft-404 candidates on the first {state.result.pagesChecked} pages.
            </p>
          ) : (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">
                  {state.result.flagged.length} flagged
                </h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Fix order: 410 if intentionally deleted, 301 if there&apos;s a
                  better page, expand content otherwise.
                </p>
              </header>
              <ul className="divide-y divide-white/[0.05]">
                {state.result.flagged.map((f) => (
                  <li key={f.url} className="px-5 py-3 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${REASON_TONE[f.reason]}`}
                      >
                        {f.reason.replace(/-/g, " ")}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {f.wordCount} words
                      </span>
                    </div>
                    <code className="block truncate">{f.url}</code>
                    <p className="text-muted-foreground">{f.detail}</p>
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
