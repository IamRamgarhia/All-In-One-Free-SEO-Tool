"use client";

import { useState } from "react";
import { openChat } from "@/components/claude/dock-store";
import { useRouter } from "next/navigation";
import { Loader2, Play, Square } from "lucide-react";

export type QueueView = {
  active: boolean;
  total: number;
  attempted: number;
  failed: number;
  current: number | null;
  currentTitle: string | null;
  note: string | null;
};

/**
 * Starts and stops "do all of this client's tasks, high priority first".
 * The state comes from the server and the page refreshes itself, so this
 * only sends the click.
 */
export function QueueBar({
  clientId,
  clientName,
  openCount,
  queue,
}: {
  clientId: number;
  clientName: string;
  openCount: number;
  queue: QueueView | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/task-queue/${clientId}`, { method });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) setError(data.error ?? "That did not work.");
    } catch {
      setError("Could not reach the app.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const active = queue?.active === true;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="min-w-0 flex-1 text-xs">
        {active ? (
          <>
            <div className="font-medium text-violet-200">
              Working through {clientName}: task {Math.min(queue.attempted, queue.total)} of {queue.total}
              {queue.failed > 0 && <span className="text-rose-300"> · {queue.failed} failed</span>}
            </div>
            {queue.current && (
              <button
                type="button"
                onClick={() => openChat(queue.current!)}
                className="mt-0.5 block max-w-full truncate text-left text-muted-foreground hover:text-foreground hover:underline"
              >
                Now: {queue.currentTitle ?? `task ${queue.current}`}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="font-medium">Run all of {clientName}&apos;s tasks with Claude</div>
            <div className="text-muted-foreground">
              {queue?.note ? `${queue.note} ` : ""}
              High priority first, then medium, then low. {openCount} open. Each task keeps its own
              chat, so nothing closes when one finishes.
            </div>
          </>
        )}
        {error && <div className="mt-1 text-rose-300">{error}</div>}
      </div>
      {active ? (
        <button
          type="button"
          onClick={() => call("DELETE")}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
          Stop queue
        </button>
      ) : (
        <button
          type="button"
          onClick={() => call("POST")}
          disabled={busy || openCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/30 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Start queue
        </button>
      )}
    </section>
  );
}
