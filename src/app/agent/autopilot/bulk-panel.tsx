"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BulkGroup, BulkResult } from "@/lib/agent/bulk";
import { approveAllOfKind } from "./actions";

/**
 * Approve a whole class of change at once.
 *
 * Everything here is shaped by one thing: this applies edits to a live
 * website, many at a time, and the failure mode of a careless click is
 * ninety wrong pages rather than one.
 *
 * So the count is stated before the verb, examples of the actual values
 * are on screen before the button, a group containing any judgement
 * call has to be confirmed separately, and site-wide kinds are shown
 * with a reason rather than hidden.
 */
export function BulkPanel({
  clientId,
  groups,
}: {
  clientId: number;
  groups: BulkGroup[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, BulkResult>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [, start] = useTransition();

  if (groups.length === 0) return null;

  const run = (kind: string, includeNeedsReview: boolean) => {
    setBusy(kind);
    setConfirming(null);
    start(async () => {
      const r = await approveAllOfKind({ clientId, kind, includeNeedsReview });
      setResults((prev) => ({ ...prev, [kind]: r }));
      setBusy(null);
    });
  };

  return (
    <section className="glass-apple overflow-hidden rounded-2xl">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Layers className="mt-0.5 size-4 shrink-0 text-cyan-400" />
        <span>
          <h2 className="text-sm font-semibold">Apply a whole group</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The per-run caps mean a site with two hundred pages missing a
            description takes ten days of coming back and clicking. The
            decision was made on day one. Every change is still logged
            individually and can still be undone one at a time.
          </p>
        </span>
      </header>

      <ul className="divide-y divide-border">
        {groups.map((g) => {
          const done = results[g.kind];
          return (
            <li key={g.kind} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[13px] font-medium">
                  {g.count} × {g.kind.replace(/^write_/, "").replace(/_/g, " ")}
                </span>
                {g.risk === "needs_review" && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3" />
                    contains judgement calls
                  </span>
                )}
              </div>

              {g.samples.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {g.samples.map((s) => (
                    <li
                      key={s.id}
                      className="truncate text-[11px] text-muted-foreground"
                    >
                      <span className="opacity-60">
                        {shortPath(s.targetUrl)}
                      </span>{" "}
                      → {s.afterValue}
                    </li>
                  ))}
                  {g.count > g.samples.length && (
                    <li className="text-[11px] text-muted-foreground opacity-60">
                      and {g.count - g.samples.length} more
                    </li>
                  )}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!g.bulkable ? (
                  <span className="text-[11px] text-muted-foreground">
                    {g.reason}
                  </span>
                ) : done ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                    <Check className="size-3.5" />
                    {done.applied} applied
                    {done.failed > 0 && `, ${done.failed} failed`}
                    {done.skipped > 0 && `, ${done.skipped} left for review`}
                  </span>
                ) : busy === g.kind ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    applying {g.count}, one at a time
                  </span>
                ) : confirming === g.kind ? (
                  <>
                    <span className="text-[11px] text-amber-700 dark:text-amber-300">
                      This group includes changes the agent wanted a person to
                      read. Apply all {g.count}?
                    </span>
                    <Button size="sm" onClick={() => run(g.kind, true)}>
                      Yes, apply all
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant={g.risk === "safe" ? "default" : "outline"}
                    disabled={busy !== null}
                    onClick={() =>
                      g.risk === "safe"
                        ? run(g.kind, false)
                        : setConfirming(g.kind)
                    }
                  >
                    Apply all {g.count}
                  </Button>
                )}
              </div>

              {done?.errors.length ? (
                <ul className="mt-2 space-y-0.5">
                  {done.errors.map((e, i) => (
                    <li key={i} className="text-[11px] text-destructive">
                      {e}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function shortPath(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
