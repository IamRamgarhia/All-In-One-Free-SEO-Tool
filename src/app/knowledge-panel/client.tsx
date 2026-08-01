"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { listKpSnapshots, runKpCapture, type CaptureState } from "./actions";
import type { KnowledgePanelSnapshot } from "@/db/schema";

export function KnowledgePanelClient({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [clientId, setClientId] = useState<string>(
    clients[0]?.id?.toString() ?? "",
  );
  const [query, setQuery] = useState("");
  const [state, formAction, pending] = useActionState<CaptureState, FormData>(
    runKpCapture,
    null,
  );
  const [history, setHistory] = useState<KnowledgePanelSnapshot[]>([]);

  useEffect(() => {
    if (clientId) {
      // Async load: the snapshot fetch can't run during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      listKpSnapshots(Number(clientId)).then(setHistory);
    } else {
      // Clearing history when no client is selected — the sibling branch is an async fetch, so this has to live in the same effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistory([]);
    }
  }, [clientId, state]);

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[200px_1fr_auto]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Client</span>
            <select
              name="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              {clients.length === 0 ? (
                <option value="">No clients yet</option>
              ) : (
                clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">
              Brand query (defaults to client name)
            </span>
            <input
              name="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Acme Inc"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !clientId}
            className="mt-5 inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Capturing…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 size-3" />
                Capture now
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
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">Latest capture</h2>
            {!state.data.present && (
              <p className="mt-1 text-xs text-amber-300">
                No Knowledge Panel found for this brand query. Smaller brands
                may not yet have one — Google needs strong entity signals
                (Wikipedia + multiple authoritative sameAs links).
              </p>
            )}
          </header>
          <div className="space-y-3 p-5 text-sm">
            {state.changes.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="font-medium text-amber-300">Changes since last snapshot</p>
                <ul className="mt-1 space-y-0.5 text-[11px]">
                  {state.changes.map((c, i) => (
                    <li key={i}>· {c}</li>
                  ))}
                </ul>
              </div>
            )}
            {state.data.present && (
              <>
                <Field label="Title" value={state.data.title} />
                <Field label="Subtitle" value={state.data.subtitle} />
                <Field label="Description" value={state.data.description} />
                {state.data.sameAs.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      sameAs (Wikipedia / Crunchbase / etc.)
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[11px]">
                      {state.data.sameAs.map((u) => (
                        <li key={u}>
                          <a
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="text-violet-300 hover:underline"
                          >
                            {u}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {state.data.facts.length > 0 && (
                  <div className="rounded-md bg-white/[0.03] p-3 text-xs">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Facts
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {state.data.facts.map((f, i) => (
                        <li key={i}>
                          <strong>{f.label}:</strong> {f.value}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-3">
            <h3 className="text-sm font-semibold">Snapshot history</h3>
          </header>
          <ul className="divide-y divide-white/[0.06]">
            {history.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-5 py-2 text-xs"
              >
                <span>{new Date(s.capturedAt).toLocaleString()}</span>
                <span
                  className={
                    s.present ? "text-emerald-300" : "text-muted-foreground"
                  }
                >
                  {s.present ? "Panel present" : "Panel absent"}
                </span>
                <span className="truncate text-muted-foreground">
                  {s.title ?? s.query}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
