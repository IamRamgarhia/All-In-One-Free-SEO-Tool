"use client";

import { useEffect, useState } from "react";
import { ExternalLink, GitMerge, Loader2, RefreshCw } from "lucide-react";

type Pr = {
  number: number;
  title: string;
  url: string;
  taskId: number | null;
  checks: "passing" | "pending" | "failing" | "none";
  mergeable: boolean;
  draft: boolean;
  ready: boolean;
};

type Result = { number: number; ok: boolean; message: string };

const CHECK_LABEL: Record<Pr["checks"], { text: string; cls: string }> = {
  passing: { text: "checks passed", cls: "text-emerald-300" },
  pending: { text: "checks running", cls: "text-amber-300" },
  failing: { text: "a check failed", cls: "text-rose-300" },
  none: { text: "no checks", cls: "text-muted-foreground" },
};

function why(pr: Pr): string | null {
  if (pr.ready) return null;
  if (pr.draft) return "draft";
  if (!pr.mergeable) return "conflicts or not computed yet";
  if (pr.checks === "pending") return "waiting for checks";
  if (pr.checks === "failing") return "a check failed";
  return null;
}

/**
 * The pull requests Claude opened for this client's tasks, with Merge on
 * each and Merge all for the ones that are ready. Merging in one go, after
 * Claude is done with every task, means the site is built and deployed
 * when you decide rather than after each task.
 */
export function PrBar({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [prs, setPrs] = useState<Pr[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  // Bumped to read the list again (after a merge, or by the refresh button).
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/task-pr/${clientId}`, { cache: "no-store" });
        const data = (await res.json()) as { ok: boolean; prs?: Pr[]; error?: string };
        if (!live) return;
        if (data.ok) {
          setPrs(data.prs ?? []);
          setError(null);
        } else {
          setError(data.error ?? "Could not read the pull requests.");
        }
      } catch {
        if (live) setError("Could not reach the app.");
      }
    };
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [clientId, tick]);

  async function merge(body: { number: number } | { all: true }) {
    setBusy("number" in body ? body.number : "all");
    setResults([]);
    try {
      const res = await fetch(`/api/task-pr/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; results?: Result[]; error?: string };
      if (data.results) setResults(data.results);
      else if (!data.ok) setError(data.error ?? "That did not work.");
    } catch {
      setError("Could not reach the app.");
    } finally {
      setBusy(null);
      reload();
    }
  }

  // Nothing to show until there is a pull request (or a problem).
  if (!error && (!prs || prs.length === 0) && results.length === 0) return null;

  const ready = (prs ?? []).filter((p) => p.ready);

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-emerald-200">
            {prs?.length ?? 0} open pull request{prs?.length === 1 ? "" : "s"} for {clientName}
          </div>
          <div className="text-muted-foreground">
            Merge them when you are ready: the site is rebuilt once per merge, not once per task.
          </div>
        </div>
        <button
          type="button"
          onClick={reload}
          title="Refresh"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={busy !== null || ready.length === 0}
          onClick={() => void merge({ all: true })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 font-medium text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {busy === "all" ? <Loader2 className="size-3.5 animate-spin" /> : <GitMerge className="size-3.5" />}
          Merge all ({ready.length})
        </button>
      </div>

      {error && <p className="mt-2 text-rose-300">{error}</p>}

      {prs && prs.length > 0 && (
        <ul className="mt-2 divide-y divide-white/5">
          {prs.map((p) => {
            const c = CHECK_LABEL[p.checks];
            const blocked = why(p);
            return (
              <li key={p.number} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 max-w-full flex-1 items-center gap-1 truncate hover:underline"
                >
                  <span className="text-muted-foreground">#{p.number}</span>
                  <span className="truncate">{p.title}</span>
                  <ExternalLink className="size-3 shrink-0 opacity-60" />
                </a>
                <span className={c.cls}>{c.text}</span>
                {blocked && <span className="text-muted-foreground">· {blocked}</span>}
                <button
                  type="button"
                  disabled={busy !== null || !p.ready}
                  onClick={() => void merge({ number: p.number })}
                  className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 font-medium ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-40"
                >
                  {busy === p.number ? <Loader2 className="size-3 animate-spin" /> : <GitMerge className="size-3" />}
                  Merge
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {results.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {results.map((r) => (
            <li key={r.number} className={r.ok ? "text-emerald-300" : "text-rose-300"}>
              #{r.number}: {r.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
