"use client";

import { useActionState, useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import {
  listAuthorRecords,
  runAuthorScan,
  type ScanState,
} from "./actions";
import type { AuthorAuthorityRecord } from "@/db/schema";

export function AuthorAuthorityClient({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ScanState, FormData>(
    runAuthorScan,
    null,
  );
  const [clientId, setClientId] = useState<string>(
    clients[0]?.id?.toString() ?? "",
  );
  const [history, setHistory] = useState<AuthorAuthorityRecord[]>([]);

  useEffect(() => {
    if (clientId) {
      // Async load: the history fetch can't run during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      listAuthorRecords(Number(clientId)).then(setHistory);
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
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[200px_1fr_1fr_auto]">
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
            <span className="text-muted-foreground">Domain to scan</span>
            <input
              name="domain"
              required
              placeholder="competitor.com"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">
              Topic hints (comma-separated, optional)
            </span>
            <input
              name="topics"
              placeholder="seo, content marketing, technical seo"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="mt-5 inline-flex h-9 items-center rounded-md bg-cyan-500/15 px-4 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <>
                <Search className="mr-1 size-3" />
                Scan
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

      {state?.ok && state.observations.length === 0 && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-inset ring-amber-500/30">
          No author pages found. The site may not use a standard /author/
          URL pattern, or it may not have named bylines.
        </p>
      )}

      {state?.ok && state.observations.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Just scanned: {state.observations.length} authors found ·{" "}
          {state.stored.inserted} new, {state.stored.updated} updated.
        </p>
      )}

      {history.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users className="size-3.5" />
              Author records ({history.length})
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Sorted by authority score. High-scoring authors are good
              targets for outreach, podcast invites, or co-authored research.
            </p>
          </header>
          <ul className="divide-y divide-white/[0.06]">
            {history.map((a) => (
              <li key={a.id} className="space-y-2 px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`grid h-9 w-12 place-items-center rounded-lg text-sm font-bold tabular-nums ring-1 ring-inset ${
                      a.authorityScore >= 70
                        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                        : a.authorityScore >= 40
                          ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                          : "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                    }`}
                  >
                    {a.authorityScore}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <strong className="font-semibold">{a.authorName}</strong>
                      {a.jobTitle && (
                        <span className="text-[11px] text-muted-foreground">
                          {a.jobTitle}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        @ {a.domain}
                      </span>
                    </div>
                    {a.bio && (
                      <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                        {a.bio}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="rounded-md bg-white/5 px-1.5 py-0.5 ring-1 ring-inset ring-white/10">
                        {a.postCount} posts seen
                      </span>
                      {(a.sameAs ?? []).slice(0, 4).map((u) => {
                        let host = u;
                        try {
                          host = new URL(u).hostname.replace(/^www\./, "");
                        } catch {
                          // ignore
                        }
                        return (
                          <a
                            key={u}
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/20"
                          >
                            {host}
                            <ExternalLink className="size-2.5" />
                          </a>
                        );
                      })}
                      {(a.topics ?? []).map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-violet-300 ring-1 ring-inset ring-violet-500/30"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {a.authorUrl && (
                    <a
                      href={a.authorUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-violet-300 hover:underline"
                    >
                      Profile ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
