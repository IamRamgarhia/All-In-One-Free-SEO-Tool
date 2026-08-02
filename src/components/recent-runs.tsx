"use client";

import { useEffect, useState, useTransition } from "react";
import { Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import {
  clearAllRunsForTool,
  deleteRunAction,
  fetchRecentRuns,
  togglePinAction,
} from "@/app/api/tool-runs/actions";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import type { ToolRun } from "@/db/schema";

/**
 * Browse + manage prior runs of a single tool. Drop-in component:
 *
 *   <RecentRuns toolId="crux-origin" onRestore={(run) => fillFormFromRun(run)} />
 *
 * The tool decides what to do when the user clicks a row — typically the
 * restore handler re-populates the form's state. If you only want a
 * read-only history list, omit `onRestore`.
 */
export function RecentRuns({
  toolId,
  clientId,
  onRestore,
  refreshKey = 0,
  limit = 10,
}: {
  toolId: string;
  clientId?: number | null;
  onRestore?: (run: ToolRun) => void;
  /** Bump this when a fresh run was just saved so the list re-fetches. */
  refreshKey?: number | string;
  limit?: number;
}) {
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    // Sets the spinner immediately before an await; fetching during render isn't an option.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchRecentRuns({ toolId, clientId, limit })
      .then((rows) => {
        if (active) setRuns(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [toolId, clientId, limit, refreshKey]);

  if (!loading && runs.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <h3 className="text-xs font-semibold">Recent runs</h3>
        {runs.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Clear all unpinned runs for this tool?",
                description: "Pinned runs are kept. This can't be undone.",
                confirmLabel: "Clear unpinned",
                destructive: true,
              });
              if (!ok) return;
              startTransition(async () => {
                await clearAllRunsForTool(toolId, clientId ?? null);
                const rows = await fetchRecentRuns({ toolId, clientId, limit });
                setRuns(rows);
              });
            }}
            className="text-[10px] text-muted-foreground hover:text-rose-300 hover:underline disabled:opacity-50"
          >
            Clear unpinned
          </button>
        )}
      </header>
      {loading && runs.length === 0 ? (
        <p className="px-4 py-3 text-[11px] text-muted-foreground">
          Loading…
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {runs.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 px-4 py-2 text-xs transition-colors hover:bg-white/[0.02]"
            >
              {r.pinned && (
                <Pin className="size-3 shrink-0 text-amber-300" />
              )}
              <button
                type="button"
                onClick={() => onRestore?.(r)}
                disabled={!onRestore}
                className={`min-w-0 flex-1 text-left ${
                  onRestore ? "hover:text-foreground" : "cursor-default"
                }`}
                title={
                  onRestore
                    ? `Click to restore — ${r.label}`
                    : r.label
                }
              >
                {/* Labels follow a convention: "subject · result1 · result2".
                    Render first chunk as the subject (primary text) and
                    join the rest as a muted secondary line so the row
                    reads as data, not a single string of dots. */}
                {(() => {
                  const parts = r.label.split("·").map((s) => s.trim());
                  const [subject, ...rest] = parts;
                  const hasRest = rest.length > 0;
                  return (
                    <>
                      <div className="truncate font-medium">
                        {subject}
                      </div>
                      <div className="flex items-center gap-2 truncate text-[10px] text-muted-foreground">
                        {hasRest && (
                          <span className="truncate">{rest.join(" · ")}</span>
                        )}
                        {hasRest && (
                          <span aria-hidden className="text-muted-foreground/40">
                            ·
                          </span>
                        )}
                        <time
                          dateTime={new Date(r.createdAt).toISOString()}
                          className="shrink-0"
                        >
                          {new Date(r.createdAt).toLocaleString()}
                        </time>
                      </div>
                    </>
                  );
                })()}
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {onRestore && (
                  <button
                    type="button"
                    onClick={() => onRestore(r)}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    title="Restore"
                  >
                    <RotateCcw className="size-3" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await togglePinAction(r.id, toolId);
                      const rows = await fetchRecentRuns({
                        toolId,
                        clientId,
                        limit,
                      });
                      setRuns(rows);
                    });
                  }}
                  className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-50"
                  title={r.pinned ? "Unpin" : "Pin"}
                >
                  {r.pinned ? (
                    <PinOff className="size-3" />
                  ) : (
                    <Pin className="size-3" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: "Delete this run?",
                      description:
                        "The result is removed permanently. Re-run the tool to regenerate it.",
                      confirmLabel: "Delete",
                      destructive: true,
                    });
                    if (!ok) return;
                    startTransition(async () => {
                      await deleteRunAction(r.id, toolId);
                      const rows = await fetchRecentRuns({
                        toolId,
                        clientId,
                        limit,
                      });
                      setRuns(rows);
                    });
                  }}
                  className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                  title="Delete"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
