"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Layers, Loader2 } from "lucide-react";
import { runCluster, type ClusterState } from "./actions";

const INTENT_TONE: Record<string, string> = {
  informational: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  commercial: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  transactional: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  navigational: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  local: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export function ClusterForm() {
  const [state, formAction, pending] = useActionState<
    ClusterState | null,
    FormData
  >(runCluster, null);
  const [copied, setCopied] = useState(false);

  function copyAsCsv() {
    if (!state?.ok) return;
    const lines = ["type,title,slug,intent,format,angle,links"];
    if (state.plan.pillar) {
      const p = state.plan.pillar;
      lines.push(
        [
          "pillar",
          esc(p.title),
          p.slug,
          p.intent,
          p.format,
          esc(p.angle),
          esc(p.links.join(" | ")),
        ].join(","),
      );
    }
    for (const s of state.plan.spokes) {
      lines.push(
        [
          "spoke",
          esc(s.title),
          s.slug,
          s.intent,
          s.format,
          esc(s.angle),
          esc(s.links.join(" | ")),
        ].join(","),
      );
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_120px_140px]">
          <input
            name="topic"
            required
            placeholder="home espresso machines"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <input
            name="country"
            defaultValue="US"
            maxLength={4}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm uppercase focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-cyan-500/15 px-4 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Mining + planning…
              </>
            ) : (
              <>
                <Layers className="mr-2 size-3" />
                Build cluster
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

      {state?.ok && state.plan.pillar && (
        <>
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Pillar (hub) page</h3>
              <button
                type="button"
                onClick={copyAsCsv}
                className="inline-flex h-7 items-center rounded-md bg-white/5 px-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 size-3 text-emerald-300" />
                    Copied CSV
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 size-3" />
                    Copy CSV (pillar + spokes)
                  </>
                )}
              </button>
            </div>
            <div className="rounded-xl bg-cyan-500/[0.08] p-4 ring-1 ring-inset ring-cyan-500/20">
              <p className="text-base font-semibold">{state.plan.pillar.title}</p>
              <code className="mt-1 block text-xs text-muted-foreground">
                {state.plan.pillar.slug}
              </code>
              <p className="mt-1 text-sm text-muted-foreground">
                {state.plan.pillar.angle}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <span
                  className={`rounded-full px-2 py-0.5 uppercase tracking-wider ring-1 ring-inset ${INTENT_TONE[state.plan.pillar.intent]}`}
                >
                  {state.plan.pillar.intent}
                </span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-muted-foreground ring-1 ring-inset ring-white/10">
                  {state.plan.pillar.format}
                </span>
              </div>
            </div>
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h3 className="text-sm font-semibold">
                Spoke pages ({state.plan.spokes.length})
              </h3>
            </header>
            <ul className="divide-y divide-white/[0.05]">
              {state.plan.spokes.map((s) => (
                <li key={s.slug} className="px-5 py-3 text-xs space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{s.title}</p>
                      <code className="block text-[10px] text-muted-foreground">
                        {s.slug}
                      </code>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1 text-[10px]">
                      <span
                        className={`rounded-full px-2 py-0.5 uppercase tracking-wider ring-1 ring-inset ${INTENT_TONE[s.intent]}`}
                      >
                        {s.intent}
                      </span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-muted-foreground ring-1 ring-inset ring-white/10">
                        {s.format}
                      </span>
                    </div>
                  </div>
                  <p className="text-muted-foreground">{s.angle}</p>
                  {s.links.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Links to:{" "}
                      {s.links.map((l) => (
                        <code key={l} className="mr-1.5 rounded bg-white/5 px-1.5 py-0.5">
                          {l}
                        </code>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
            <h3 className="text-sm font-semibold">Signals used</h3>
            <div className="grid gap-2 text-xs sm:grid-cols-2 md:grid-cols-4">
              <SignalGroup label="PAA" items={state.plan.signals.paa} />
              <SignalGroup label="Related" items={state.plan.signals.related} />
              <SignalGroup label="Autocomplete" items={state.plan.signals.autocomplete} />
              <SignalGroup label="Reddit" items={state.plan.signals.reddit} />
            </div>
          </section>
        </>
      )}
    </>
  );
}

function SignalGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-md bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label} ({items.length})
      </div>
      <ul className="mt-1 space-y-0.5">
        {items.slice(0, 5).map((s) => (
          <li key={s} className="truncate text-[11px]">
            {s}
          </li>
        ))}
        {items.length > 5 && (
          <li className="text-[10px] text-muted-foreground">+ {items.length - 5} more</li>
        )}
      </ul>
    </div>
  );
}

function esc(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
