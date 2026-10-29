import Link from "next/link";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  ListChecks,
  Sparkles,
  Clock,
  Check,
  LayoutGrid,
  LayoutTemplate,
  List,
  SkipForward,
} from "lucide-react";
import { db } from "@/db/client";
import { tasks, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { type TaskRowData } from "./task-row";
import { NewTaskTrigger } from "./new-task-form";
import { TasksBulkList, type BulkTask } from "./bulk-list";
import { KanbanBoard } from "./kanban-board";
import { LiveRefresh } from "./live-refresh";
import { PrBar } from "./pr-bar";
import { QueueBar } from "./queue-bar";
import { queueFor } from "@/lib/task-chat/queue";
import { isOpenTask } from "@/lib/task-status";

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
  searchParams: Promise<{ filter?: Filter; view?: ViewMode; client?: string }>;
}) {
  const sp = await searchParams;
  const filter: Filter = sp.filter && sp.filter in filterMap ? sp.filter : "all";
  const view: ViewMode = sp.view === "kanban" ? "kanban" : "list";

  const all = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      whyItMatters: tasks.whyItMatters,
      toolPath: tasks.toolPath,
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
    .select({ id: clients.id, name: clients.name, localPath: clients.localPath, githubRepo: clients.githubRepo })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);

  // Only a client this person may see counts; anything else falls back to all.
  const requested = Number(sp.client);
  const clientId = allClients.some((c) => c.id === requested) ? requested : null;
  const pickerClients = allClients.map((c) => ({
    id: c.id,
    name: c.name,
    open: all.filter((t) => t.clientId === c.id && isOpenTask(t.status)).length,
  }));

  const selected = clientId === null ? null : allClients.find((c) => c.id === clientId) ?? null;
  const q = clientId === null ? null : queueFor(clientId);
  const queueView = q && {
    active: q.active,
    total: q.total,
    attempted: q.attempted.length,
    failed: q.failed.length,
    current: q.current,
    currentTitle: all.find((t) => t.id === q.current)?.title ?? null,
    note: q.note,
  };

  const filtered = all.filter(
    (t) => (clientId === null || t.clientId === clientId) && inFilter(t, filter),
  );
  // Skipped is a decision, not outstanding work — counting it as open
  // means a list someone has finished with never reads as finished.
  const open = filtered.filter((t) => isOpenTask(t.status));
  const done = filtered.filter((t) => t.status === "done");
  const skipped = filtered.filter((t) => t.status === "skipped");
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <LiveRefresh />
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
              href={tasksHref(filter, "list", clientId)}
              className={
                view === "list"
                  ? "inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/10"
                  : "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }
            >
              <List className="size-3" /> List
            </Link>
            <Link
              href={tasksHref(filter, "kanban", clientId)}
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
            <FilterTabs current={filter} view={view} clientId={clientId} />
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground ring-1 ring-inset ring-white/10">
              <Clock className="size-3" />
              {open.length} open
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
              <Check className="size-3" />
              {done.length} done
            </span>
            {skipped.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground ring-1 ring-inset ring-white/10">
                <SkipForward className="size-3" />
                {skipped.length} skipped
              </span>
            )}
          </div>
        }
      />

      {pickerClients.length > 1 && (
        <section className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/5 bg-card/40 p-3 backdrop-blur-md">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Client
          </span>
          <Link href={tasksHref(filter, view, null)} className={pill(clientId === null)}>
            Any
          </Link>
          {pickerClients.map((c) => (
            <Link
              key={c.id}
              href={tasksHref(filter, view, c.id)}
              className={pill(clientId === c.id)}
            >
              {c.name} ({c.open})
            </Link>
          ))}
        </section>
      )}

      {selected?.localPath && (
        <QueueBar
          clientId={selected.id}
          clientName={selected.name}
          openCount={all.filter((t) => t.clientId === selected.id && isOpenTask(t.status)).length}
          queue={queueView}
        />
      )}

      {selected?.githubRepo && <PrBar clientId={selected.id} clientName={selected.name} />}

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

const pill = (active: boolean) =>
  `rounded-full px-2.5 py-1 text-[11px] ring-1 ring-inset transition-colors ${
    active
      ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
      : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
  }`;

function tasksHref(filter: Filter, view: ViewMode, clientId: number | null): string {
  const qs = new URLSearchParams({ filter, view });
  if (clientId !== null) qs.set("client", String(clientId));
  return `/tasks?${qs.toString()}`;
}

function FilterTabs({
  current,
  view,
  clientId,
}: {
  current: Filter;
  view: ViewMode;
  clientId: number | null;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/5 p-0.5 ring-1 ring-inset ring-white/10">
      {(Object.keys(filterMap) as Filter[]).map((f) => (
        <Link
          key={f}
          href={tasksHref(f, view, clientId)}
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

