"use client";

import { useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, Loader2, MinusCircle, Repeat } from "lucide-react";
import { setTaskStatus, deleteTask } from "./actions";
import { TimeTracker } from "./time-tracker";

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
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

export type TaskRowData = {
  id: number;
  title: string;
  whyItMatters: string | null;
  priority: string;
  status: string;
  dueDate: Date | null;
  recurringInterval: string | null;
  clientId: number | null;
  clientName: string | null;
  actualMinutes?: number | null;
};

export function TaskRow({
  task,
  nowMs,
}: {
  task: TaskRowData;
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
    <div className="px-5 py-4 transition-colors hover:bg-white/[0.03]">
      <div className="flex items-start gap-3">
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
            <TimeTracker
              taskId={task.id}
              initialMinutes={task.actualMinutes ?? null}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${sCfg.className}`}
          >
            {sCfg.label}
          </span>
          <DeleteButton taskId={task.id} />
        </div>
      </div>
    </div>
  );
}

export function DeleteButton({ taskId }: { taskId: number }) {
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

function dueBadgeProps(
  dueDate: Date,
  done: boolean,
  nowMs: number,
): { tone: string; label: string } {
  const ms = dueDate.getTime() - nowMs;
  const days = Math.round(ms / 86_400_000);
  if (done) {
    return {
      tone: "bg-white/5 text-muted-foreground ring-white/10",
      label: `was due ${dueDate.toLocaleDateString()}`,
    };
  }
  if (days < 0) {
    return {
      tone: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
      label: `${Math.abs(days)}d overdue`,
    };
  }
  if (days === 0) {
    return {
      tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
      label: "due today",
    };
  }
  if (days <= 7) {
    return {
      tone: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
      label: `due in ${days}d`,
    };
  }
  return {
    tone: "bg-white/5 text-muted-foreground ring-white/10",
    label: `due in ${days}d`,
  };
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

export function KanbanCard({
  task,
  nowMs,
}: {
  task: TaskRowData;
  nowMs: number;
}) {
  const [pending, startTransition] = useTransition();
  const next: "todo" | "in_progress" | "done" =
    task.status === "todo"
      ? "in_progress"
      : task.status === "in_progress"
        ? "done"
        : "todo";

  const priorityTone: Record<string, string> = {
    high: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    medium: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    low: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  };

  return (
    <div className="rounded-xl border border-white/5 bg-card/60 p-3 backdrop-blur-md transition-colors hover:border-white/10">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-snug">{task.title}</div>
        <button
          type="button"
          aria-label="Advance status"
          disabled={pending}
          onClick={() =>
            startTransition(() => setTaskStatus(task.id, next))
          }
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${priorityTone[task.priority] ?? "bg-white/5"}`}
        >
          {task.priority}
        </span>
        {task.clientName && task.clientId && (
          <Link
            href={`/clients/${task.clientId}`}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            {task.clientName}
          </Link>
        )}
      </div>
      {task.dueDate && (
        <div className="mt-1.5">
          <DueBadge
            dueDate={task.dueDate}
            done={task.status === "done"}
            nowMs={nowMs}
          />
        </div>
      )}
    </div>
  );
}
