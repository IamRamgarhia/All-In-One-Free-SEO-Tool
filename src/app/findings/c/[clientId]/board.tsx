"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, EyeOff, Loader2, Undo2 } from "lucide-react";
import { markFindingStatus } from "@/lib/findings-actions";
import type { OpenToolFinding } from "@/lib/tool-findings";

/**
 * The findings, grouped by the tool that found them, with the two
 * decisions a person can make about each.
 *
 * Resolve and ignore are deliberately separate and worded plainly.
 * "Resolved" means it was fixed; "not a problem here" means the check is
 * right about the facts and wrong about whether they matter on this
 * site. Collapsing them into one button would lose the distinction the
 * next run depends on, and it is the distinction a person most wants to
 * record.
 *
 * Both are undoable. A misclick that permanently hides a real problem is
 * the worst thing this screen could do.
 */
export function FindingsBoard({
  clientId,
  clientName,
  findings,
}: {
  clientId: number;
  clientName: string;
  findings: OpenToolFinding[];
}) {
  // The list is snapshotted on mount and deliberately does not follow
  // the prop.
  //
  // `markFindingStatus` revalidates, and the revalidated page no longer
  // contains the row that was just resolved — so rendering the prop
  // directly pulled each row out of the DOM a moment after its undo
  // button appeared. The button was real for about a second, and then
  // the click landed on nothing. An undo nobody can reach is worse than
  // no undo, because it is what makes the other two buttons safe to
  // press.
  //
  // The cost is that findings arriving while this page sits open are not
  // picked up until a reload, which is the right trade for a worklist.
  // The caller keys this component by client id, so switching clients
  // remounts it rather than showing one client's findings on another's
  // page.
  const [items] = useState<OpenToolFinding[]>(findings);

  const [closed, setClosed] = useState<Map<number, "resolved" | "ignored">>(
    new Map(),
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const set = (id: number, status: "resolved" | "ignored" | "new") => {
    setBusy(id);
    setError(null);
    startTransition(async () => {
      const r = await markFindingStatus(id, status);
      setBusy(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setClosed((prev) => {
        const next = new Map(prev);
        if (status === "new") next.delete(id);
        else next.set(id, status);
        return next;
      });
    });
  };

  if (items.length === 0) {
    return (
      <div className="glass-apple rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">
          Nothing open. Either the checks have not run for this client yet, or
          everything they found has been dealt with.
        </p>
        <Link
          href={`/clients/${clientId}`}
          className="mt-3 inline-block text-xs text-primary hover:underline"
        >
          Back to {clientName}
        </Link>
      </div>
    );
  }

  const byTool = new Map<string, OpenToolFinding[]>();
  for (const f of items) {
    const list = byTool.get(f.toolId);
    if (list) list.push(f);
    else byTool.set(f.toolId, [f]);
  }

  const openCount = items.filter((f) => !closed.has(f.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className="font-semibold">{openCount} open</span>
        <span className="text-xs text-muted-foreground">
          of {items.length} found across {byTool.size} tool
          {byTool.size === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300">
          {error}
        </p>
      )}

      {[...byTool.entries()].map(([toolId, list]) => (
        <section key={toolId} className="glass-apple overflow-hidden rounded-2xl">
          <header className="flex flex-wrap items-baseline gap-x-3 border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">{toolId}</h2>
            <Link
              href={`/tools/${toolId}?clientId=${clientId}`}
              className="text-[11px] text-primary hover:underline"
            >
              run it again
            </Link>
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {list.filter((f) => !closed.has(f.id)).length} open
            </span>
          </header>

          <ul className="divide-y divide-border">
            {list.map((f) => {
              const state = closed.get(f.id);
              return (
                <li
                  key={f.id}
                  className={`flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 ${
                    state ? "opacity-60" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <SeverityChip severity={f.severity} />
                      <span
                        className={`text-[13px] font-medium leading-tight ${
                          state ? "line-through" : ""
                        }`}
                      >
                        {f.title}
                      </span>
                    </span>
                    {f.details && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {f.details}
                      </span>
                    )}
                  </span>

                  {busy === f.id ? (
                    <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : state ? (
                    <button
                      type="button"
                      onClick={() => set(f.id, "new")}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] hover:bg-muted/70"
                    >
                      <Undo2 className="size-3" />
                      {state === "resolved" ? "Resolved" : "Ignored"} — undo
                    </button>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => set(f.id, "resolved")}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                      >
                        <Check className="size-3" />
                        Fixed
                      </button>
                      <button
                        type="button"
                        onClick={() => set(f.id, "ignored")}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/70"
                        title="The check is right about the facts and wrong about whether they matter here. It will not be raised again."
                      >
                        <EyeOff className="size-3" />
                        Not a problem here
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  const tone =
    severity === "critical"
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      : severity === "high"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : severity === "medium"
          ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {severity}
    </span>
  );
}
