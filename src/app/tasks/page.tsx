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
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { tasks, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { type TaskRowData } from "./task-row";
import { NewTaskTrigger } from "./new-task-form";
import { TasksBulkList, type BulkTask } from "./bulk-list";
import { KanbanBoard } from "./kanban-board";
import { isOpenTask } from "@/lib/task-status";

/** Filter query values stay English technical ids. */
const filterMap = {
  all: { days: null },
  today: { days: 0 },
  week: { days: 7 },
  month: { days: 30 },
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
  const t = await getTranslations("tasks");
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
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);

  const filtered = all.filter((task) => inFilter(task, filter));
  // Skipped is a decision, not outstanding work — counting it as open
  // means a list someone has finished with never reads as finished.
  const open = filtered.filter((task) => isOpenTask(task.status));
  const done = filtered.filter((task) => task.status === "done");
  const skipped = filtered.filter((task) => task.status === "skipped");
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={ListChecks}
        accent="amber"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/tasks/templates"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <LayoutTemplate className="size-3.5" />
              {t("playbooks")}
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
              <List className="size-3" /> {t("list")}
            </Link>
            <Link
              href={`/tasks?filter=${filter}&view=kanban`}
              className={
                view === "kanban"
                  ? "inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/10"
                  : "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }
            >
              <LayoutGrid className="size-3" /> {t("kanban")}
            </Link>
          </div>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <FilterTabs current={filter} view={view} />
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground ring-1 ring-inset ring-white/10">
              <Clock className="size-3" />
              {t("openCount", { count: open.length })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
              <Check className="size-3" />
              {t("doneCount", { count: done.length })}
            </span>
            {skipped.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground ring-1 ring-inset ring-white/10">
                <SkipForward className="size-3" />
                {t("skippedCount", { count: skipped.length })}
              </span>
            )}
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
              <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {filter === "all" ? t("emptyAll") : t("emptyFiltered")}
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

async function FilterTabs({
  current,
  view,
}: {
  current: Filter;
  view: ViewMode;
}) {
  const t = await getTranslations("tasks");
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
          {t(`filters.${f}`)}
        </Link>
      ))}
    </div>
  );
}
