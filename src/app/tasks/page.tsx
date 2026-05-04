import Link from "next/link";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

import { ListChecks, Sparkles, Clock, Check, LayoutGrid, LayoutTemplate, List } from "lucide-react";
import { db } from "@/db/client";
import { tasks, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { type TaskRowData } from "./task-row";
import { NewTaskTrigger } from "./new-task-form";
import { TasksBulkList, type BulkTask } from "./bulk-list";
import { KanbanBoard } from "./kanban-board";

const filterMap = {
  all: { label: "All", days: null },
  today: { label: "Today", days: 0 },
  week: { label: "This week", days: 7 },
  month: { label: "This month", days: 30 },
} as const;

type Filter = keyof typeof filterMap;
type ViewMode = "list" | "kanban";

function inFilter(task: { dueDate: Date | null }, filter: Filter): boolean {
  if (filter === "all") return true;
  if (!task.dueDate) return false;
  const cfg = filterMap[filter];
  if (cfg.days === null) return true;
  const ms = task.dueDate.getTime() - Date.now();
  const dayMs = 86_400_000;
  return ms <= cfg.days * dayMs;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: Filter; view?: ViewMode }>;
}) {
  const sp = await searchParams;
  const filter: Filter = sp.filter && sp.filter in filterMap ? sp.filter : "all";
  const view: ViewMode = sp.view === "kanban" ? "kanban" : "list";

  const all = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      whyItMatters: tasks.whyItMatters,
      priority: tasks.priority,
      status: tasks.status,
      dueDate: tasks.dueDate,
      recurringInterval: tasks.recurringInterval,
      actualMinutes: tasks.actualMinutes,
      createdAt: tasks.createdAt,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .orderBy(desc(tasks.createdAt));

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(clients.name);

  const filtered = all.filter((t) => inFilter(t, filter));
  const open = filtered.filter((t) => t.status !== "done");
  const done = filtered.filter((t) => t.status === "done");
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Tasks"
        description="Auto-generated from audits and niche templates, plus anything you add manually."
        icon={ListChecks}
        accent="amber"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/tasks/templates"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <LayoutTemplate className="size-3.5" />
              Playbooks
            </Link>
            <NewTaskTrigger clients={allClients} />
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-card/60 p-1 backdrop-blur">
            <Link
              href={`/tasks?filter=${filter}&view=list`}
              className={
                view === "list"
                  ? "inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/10"
                  : "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }
            >
              <List className="size-3" /> List
            </Link>
            <Link
              href={`/tasks?filter=${filter}&view=kanban`}
              className={
                view === "kanban"
                  ? "inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/10"
                  : "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }
            >
              <LayoutGrid className="size-3" /> Kanban
            </Link>
          </div>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <FilterTabs current={filter} view={view} />
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground ring-1 ring-inset ring-white/10">
              <Clock className="size-3" />
              {open.length} open
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
              <Check className="size-3" />
              {done.length} done
            </span>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 px-6 py-16 text-center backdrop-blur-md">
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 ring-1 ring-amber-400/30">
              <Sparkles className="size-6 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">No tasks in this view</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {filter === "all"
                  ? "Run an audit on a client and we'll generate prioritised tasks automatically."
                  : "Switch to All to see every task, or pick a different time window."}
              </p>
            </div>
          </div>
        </div>
      ) : view === "kanban" ? (
        <KanbanBoard initialTasks={filtered as TaskRowData[]} nowMs={nowMs} />
      ) : (
        <TasksBulkList tasks={filtered as BulkTask[]} nowMs={nowMs} />
      )}
    </div>
  );
}

function FilterTabs({ current, view }: { current: Filter; view: ViewMode }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/5 p-0.5 ring-1 ring-inset ring-white/10">
      {(Object.keys(filterMap) as Filter[]).map((f) => (
        <Link
          key={f}
          href={`/tasks?filter=${f}&view=${view}`}
          className={
            current === f
              ? "rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground"
              : "rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          }
        >
          {filterMap[f].label}
        </Link>
      ))}
    </div>
  );
}

