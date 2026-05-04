"use client";

import { useActionState } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import {
  runBacklinkDiscovery,
  type DiscoveryState,
} from "./actions";

export function DiscoveryForm() {
  const [state, formAction, pending] = useActionState<
    DiscoveryState | null,
    FormData
  >(runBacklinkDiscovery, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">Target domain</span>
          <input
            name="targetDomain"
            required
            placeholder="example.com"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="skipVerify" className="size-3.5" />
          Skip the crawl-to-confirm pass (faster, mention-only)
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Discovering… (1-3 min)
            </>
          ) : (
            "Run discovery"
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Discovery runs three queries against DuckDuckGo, polls Common
          Crawl when reachable, then crawls each candidate to confirm an
          actual <code>&lt;a href&gt;</code> + extract anchor text + rel.
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Tile
              label="Verified links"
              value={state.result.verified}
              tone="emerald"
            />
            <Tile
              label="Mentions only"
              value={state.result.mentions}
              tone="amber"
            />
            <Tile
              label="Total candidates"
              value={state.result.candidates}
              tone="neutral"
            />
          </section>

          {state.result.errors.length > 0 && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300 ring-1 ring-inset ring-amber-500/30">
              Notes: {state.result.errors.join(" · ")}
            </p>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">
                Discovered links to {state.result.target}
              </h2>
            </header>
            {state.result.links.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No candidates found. Try a more popular domain or skip
                crawl-to-confirm to widen the net.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {state.result.links.map((l) => (
                  <li key={l.url} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="shrink-0">
                        {l.status === "verified" ? (
                          <CheckCircle2 className="size-4 text-emerald-300" />
                        ) : (
                          <span className="block size-4 rounded-full bg-amber-500/30 ring-1 ring-inset ring-amber-500/40" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                        >
                          {l.title || l.domain}
                          <ExternalLink className="size-3 opacity-60" />
                        </a>
                        <div className="text-[11px] text-muted-foreground">
                          {l.domain}
                        </div>
                        {l.anchorText && (
                          <div className="text-[11px]">
                            anchor:{" "}
                            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono">
                              {l.anchorText}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-[10px]">
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                            l.status === "verified"
                              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                              : "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                          }`}
                        >
                          {l.status}
                        </span>
                        {l.rel && (
                          <span className="rounded-md bg-white/5 px-2 py-0.5 text-muted-foreground ring-1 ring-inset ring-white/10">
                            rel: {l.rel}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          via {l.source === "ddg" ? "DDG" : "Common Crawl"}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "emerald" | "amber";
}) {
  const t = {
    neutral: "text-foreground",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t}`}>
        {value}
      </div>
    </div>
  );
}
