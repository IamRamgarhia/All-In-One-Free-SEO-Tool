"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useTransition } from "react";
import {
  ChevronRight,
  Filter,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import {
  clearAllRunsForTool,
  deleteRunAction,
  togglePinAction,
} from "@/app/api/tool-runs/actions";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import type { ToolRun } from "@/db/schema";

const TOOL_HREF: Record<string, string> = {
  "crux-origin": "/tools/crux-origin",
  "perf-budget": "/tools/perf-budget",
  "facet-trap": "/tools/facet-trap",
  "screenshot-import": "/tools/screenshot-import",
  "aio-passage": "/tools/aio-passage",
  "reputation-abuse-risk": "/tools/reputation-abuse-risk",
  "person-schema": "/tools/person-schema",
};

export function HistoryClient({
  runs,
  clients,
  toolCounts,
  toolLabels,
  currentTool,
  currentClient,
}: {
  runs: ToolRun[];
  clients: { id: number; name: string }[];
  toolCounts: [string, number][];
  toolLabels: Record<string, string>;
  currentTool: string;
  currentClient: number | null;
}) {
  const tx = useTranslations("ui.app_history_client");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <>
      <section className="rounded-2xl border border-white/5 bg-card/40 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Filter className="size-3 text-muted-foreground" />
          <Link
            href="/history"
            className={pillClass(currentTool === "" && currentClient === null)}
          >
            {tx("all", { toolCounts: toolCounts.reduce((s, [, n]) => s + n, 0) })}
          </Link>
          {toolCounts.map(([toolId, n]) => (
            <Link
              key={toolId}
              href={`/history?tool=${toolId}${currentClient !== null ? `&client=${currentClient}` : ""}`}
              className={pillClass(currentTool === toolId)}
            >
              {toolLabels[toolId] ?? toolId} ({n})
            </Link>
          ))}
        </div>
        {clients.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {tx("client")}
            </span>
            <Link
              href={`/history${currentTool ? `?tool=${currentTool}` : ""}`}
              className={pillClass(currentClient === null)}
            >
              {tx("any")}
            </Link>
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/history?client=${c.id}${currentTool ? `&tool=${currentTool}` : ""}`}
                className={pillClass(currentClient === c.id)}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
        {currentTool && (
          <div className="mt-3">
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: tx("clearAllUnpinnedRunsFor", { v: toolLabels[currentTool] ?? currentTool }),
                  description:
                    tx("pinnedRunsArePreservedThis"),
                  confirmLabel: tx("clearUnpinned"),
                  destructive: true,
                });
                if (!ok) return;
                startTransition(async () => {
                  const n = await clearAllRunsForTool(
                    currentTool,
                    currentClient,
                  );
                  toast.success(
                    tx("clearedOther", { n }),
                  );
                });
              }}
              className="text-[11px] text-rose-300 hover:underline disabled:opacity-50"
            >
              {tx("clearUnpinnedForThisTool")}
            </button>
          </div>
        )}
      </section>

      {runs.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-card/40 px-5 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          {tx("noRunsMatchRunA")}
        </p>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          {runs.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 px-5 py-3 text-sm"
            >
              {r.pinned && <Pin className="size-3 shrink-0 text-amber-300" />}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-violet-300 ring-1 ring-inset ring-violet-500/30">
                    {toolLabels[r.toolId] ?? r.toolId}
                  </span>
                  <span className="font-medium">{r.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString(locale)}
                  {r.clientId &&
                    clients.find((c) => c.id === r.clientId) && (
                      <span>
                        {" · "}
                        {clients.find((c) => c.id === r.clientId)?.name}
                      </span>
                    )}
                </p>
              </div>
              {TOOL_HREF[r.toolId] && (
                <Link
                  href={TOOL_HREF[r.toolId]}
                  className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
                >
                  {tx("openTool")}
                  <ChevronRight className="size-3" />
                </Link>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    await togglePinAction(r.id, r.toolId);
                  });
                }}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-50"
                title={r.pinned ? tx("unpin") : tx("pin")}
              >
                {r.pinned ? (
                  <PinOff className="size-3.5" />
                ) : (
                  <Pin className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: tx("deleteThisRun"),
                    description:
                      tx("theResultIsRemovedPermanently"),
                    confirmLabel: "Delete",
                    destructive: true,
                  });
                  if (!ok) return;
                  startTransition(async () => {
                    await deleteRunAction(r.id, r.toolId);
                  });
                }}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                title={tx("delete")}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function pillClass(active: boolean): string {
  return `rounded-full px-2.5 py-1 ring-1 ring-inset transition-colors ${
    active
      ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
      : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
  }`;
}
