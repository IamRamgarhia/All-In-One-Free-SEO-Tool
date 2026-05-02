"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Circle,
  Loader2,
  MinusCircle,
  Repeat,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  bulkDeleteTasks,
  bulkSetTaskPriority,
  bulkSetTaskStatus,
  deleteTask,
  setTaskStatus,
} from "./actions";

const priorityConfig: Record<
  string,
  {
    label: string;
    color: string;
    iconBg: string;
    iconText: string;
    accent: string;
  }
> = {
  high: {
    label: "High priority",
    color: "text-gradient-rose",
    iconBg: "bg-rose-500/15 ring-rose-400/30",
    iconText: "text-rose-300",
    accent: "from-rose-500/20",
  },
  medium: {
    label: "Medium priority",
    color: "text-gradient-amber",
    iconBg: "bg-amber-500/15 ring-amber-400/30",
    iconText: "text-amber-300",
    accent: "from-amber-500/20",
  },
  low: {
    label: "Low priority",
    color: "text-gradient-cyan",
    iconBg: "bg-cyan-500/15 ring-cyan-400/30",
    iconText: "text-cyan-300",
    accent: "from-cyan-500/20",
  },
};

export type BulkTask = {
  id: number;
  title: string;
  whyItMatters: string | null;
  priority: string;
  status: string;
  dueDate: Date | null;
  recurringInterval: string | null;
  clientId: number | null;
  clientName: string | null;
};

const statusConfig: Record<string, { label: string; className: string }> = {
  todo: {
    label: "To do",
    className: "bg-white/5 text-muted-foreground ring-white/10",
  },
  in_progress: {
    label: "In progress",
    className: "bg-violet-500/15 text-violet-300 ring-violet-500/20",
  },
  done: {
    label: "Done",
    className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
  },
  skipped: {
    label: "Skipped",
    className: "bg-white/5 text-muted-foreground ring-white/10",
  },
};

function dueBadgeProps(
  dueDate: Date,
  done: boolean,
  nowMs: number,
): { tone: string; label: string } {
  const days = Math.round((dueDate.getTime() - nowMs) / 86_400_000);
  if (done) {
    return {
      tone: "bg-white/5 text-muted-foreground ring-white/10",
      label: `was due ${dueDate.toLocaleDateString()}`,
    };
  }
  if (days < 0)
    return {
      tone: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
      label: `${Math.abs(days)}d overdue`,
    };
  if (days === 0)
    return {
      tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
      label: "due today",
    };
  if (days <= 7)
    return {
      tone: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
      label: `due in ${days}d`,
    };
  return {
    tone: "bg-white/5 text-muted-foreground ring-white/10",
    label: `due in ${days}d`,
  };
}

export function TasksBulkList({
  tasks,
  nowMs,
}: {
  tasks: BulkTask[];
  nowMs: number;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  const open = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const done = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  const byPriority = {
    high: open.filter((t) => t.priority === "high"),
    medium: open.filter((t) => t.priority === "medium"),
    low: open.filter((t) => t.priority === "low"),
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(tasks.map((t) => t.id)));
  };

  const clear = () => setSelected(new Set());

  const ids = Array.from(selected);
  const showBar = ids.length > 0;

  return (
    <div className="space-y-6">
      {showBar && (
        <div className="sticky top-14 z-20 -mx-1 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-violet-100">
              {ids.length} selected
            </span>
            <span className="mx-2 h-4 w-px bg-white/10" />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await bulkSetTaskStatus(ids, "done");
                  clear();
                })
              }
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
            >
              <Check className="size-3" /> Mark done
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await bulkSetTaskStatus(ids, "in_progress");
                  clear();
                })
              }
              className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
            >
              <MinusCircle className="size-3" /> In progress
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await bulkSetTaskStatus(ids, "todo");
                  clear();
                })
              }
              className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
            >
              <Circle className="size-3" /> Reopen
            </button>

            <span className="mx-2 h-4 w-px bg-white/10" />

            <select
              disabled={pending}
              defaultValue=""
              onChange={(e) => {
                const p = e.target.value as "high" | "medium" | "low";
                if (!p) return;
                startTransition(async () => {
                  await bulkSetTaskPriority(ids, p);
                  clear();
                });
                e.target.value = "";
              }}
              className="h-7 rounded-md border border-white/10 bg-card/60 px-2 text-xs"
            >
              <option value="">Set priority…</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  if (!confirm(`Delete ${ids.length} task(s)?`)) return;
                  await bulkDeleteTasks(ids);
                  clear();
                })
              }
              className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25"
            >
              <Trash2 className="size-3" /> Delete
            </button>

            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clear}
                className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="size-3.5" />
              </button>
              {pending && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              )}
            </span>
          </div>
        </div>
      )}

      {(["high", "medium", "low"] as const).map((p) => {
        const list = byPriority[p];
        if (list.length === 0) return null;
        const cfg = priorityConfig[p];
        return (
          <section
            key={p}
            className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md"
          >
            <div
              className={`pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-gradient-to-br ${cfg.accent} to-transparent blur-3xl`}
            />
            <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-9 items-center justify-center rounded-xl ring-1 ${cfg.iconBg}`}
                >
                  <Sparkles className={`size-4 ${cfg.iconText}`} />
                </div>
                <div>
                  <h2 className={`text-base font-semibold ${cfg.color}`}>
                    {cfg.label}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {list.length} task{list.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </header>
            <ul className="relative divide-y divide-white/5">
              {list.map((t) => (
                <Row
                  key={t.id}
                  task={t}
                  selected={selected.has(t.id)}
                  onToggle={() => toggle(t.id)}
                  nowMs={nowMs}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {done.length > 0 && (
        <details className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <summary className="cursor-pointer border-b border-white/5 px-5 py-4">
            <div className="inline-flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
                <Check className="size-4 text-emerald-300" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gradient-emerald">
                  Done
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {done.length} completed
                </p>
              </div>
            </div>
          </summary>
          <ul className="divide-y divide-white/5">
            {done.map((t) => (
              <Row
                key={t.id}
                task={t}
                selected={selected.has(t.id)}
                onToggle={() => toggle(t.id)}
                nowMs={nowMs}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({
  task,
  selected,
  onToggle,
  nowMs,
}: {
  task: BulkTask;
  selected: boolean;
  onToggle: () => void;
  nowMs: number;
}) {
  const [pending, startTransition] = useTransition();
  const sCfg = statusConfig[task.status] ?? statusConfig.todo;
  const next: "todo" | "in_progress" | "done" =
    task.status === "todo"
      ? "in_progress"
      : task.status === "in_progress"
        ? "done"
        : "todo";

  return (
    <li
      className={`px-5 py-4 transition-colors ${selected ? "bg-violet-500/5" : "hover:bg-white/[0.03]"}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 size-4 cursor-pointer rounded border-white/20 bg-card/60 accent-violet-500"
          aria-label="Select task"
        />
        <button
          type="button"
          aria-label="Cycle status"
          disabled={pending}
          onClick={() =>
            startTransition(() => setTaskStatus(task.id, next))
          }
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : task.status === "done" ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : task.status === "in_progress" ? (
            <MinusCircle className="size-4 text-violet-300" />
          ) : (
            <Circle className="size-4" />
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div
            className={`text-sm font-medium leading-snug ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}
          >
            {task.title}
          </div>
          {task.whyItMatters && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {task.whyItMatters}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            {task.clientName && task.clientId && (
              <Link
                href={`/clients/${task.clientId}`}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {task.clientName}
              </Link>
            )}
            {task.dueDate && (
              <DueBadge
                dueDate={task.dueDate}
                done={task.status === "done"}
                nowMs={nowMs}
              />
            )}
            {task.recurringInterval && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 font-medium text-violet-300 ring-1 ring-inset ring-violet-500/20">
                <Repeat className="size-2.5" />
                {task.recurringInterval}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${sCfg.className}`}
          >
            {sCfg.label}
          </span>
          <DeleteOne taskId={task.id} />
        </div>
      </div>
    </li>
  );
}

function DeleteOne({ taskId }: { taskId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete task"
      disabled={pending}
      onClick={() => startTransition(() => deleteTask(taskId))}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
    >
      <X className="size-3.5" />
    </button>
  );
}

function DueBadge({
  dueDate,
  done,
  nowMs,
}: {
  dueDate: Date;
  done: boolean;
  nowMs: number;
}) {
  const { tone, label } = dueBadgeProps(dueDate, done, nowMs);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${tone}`}
    >
      {label}
    </span>
  );
}
