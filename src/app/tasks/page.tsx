import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

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
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { taskTitle } from "@/lib/issue-display";
import { tasks, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { type TaskRowData } from "./task-row";
import { NewTaskTrigger } from "./new-task-form";
import { TasksBulkList, type BulkTask } from "./bulk-list";
import { KanbanBoard } from "./kanban-board";
import { isOpenTask } from "@/lib/task-status";
import { mayUseClientCode } from "@/lib/code-agent-access";
import { clientCodeView } from "@/lib/code-agent-view";
import { queueFor } from "@/lib/task-chat/queue";
import { ClientCodePanel, type QueueView } from "./code-panel";

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
  searchParams: Promise<{ filter?: Filter; view?: ViewMode; client?: string }>;
}) {
  const t = await getTranslations("tasks");
  const sp = await searchParams;
  const filter: Filter = sp.filter && sp.filter in filterMap ? sp.filter : "all";
  const view: ViewMode = sp.view === "kanban" ? "kanban" : "list";
  // ?client= narrows the list to one project (links from the dashboard,
  // the project plan and onboarding). Still inside the user's scope.
  const onlyClient = sp.client && /^\d+$/.test(sp.client) ? Number(sp.client) : null;
  const scopeWhere = await clientScope();

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      whyItMatters: tasks.whyItMatters,
      toolPath: tasks.toolPath,
      sourceRef: tasks.sourceRef,
      pages: tasks.pages,
      priority: tasks.priority,
      status: tasks.status,
      dueDate: tasks.dueDate,
      recurringInterval: tasks.recurringInterval,
      actualMinutes: tasks.actualMinutes,
      createdAt: tasks.createdAt,
      clientId: clients.id,
      clientName: clients.name,
      clientUrl: clients.url,
    })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    // Members and client viewers see their projects' tasks only; this
    // list used to load every task of the agency for them.
    .where(and(scopeWhere, onlyClient === null ? undefined : eq(tasks.clientId, onlyClient)))
    .orderBy(desc(tasks.createdAt));
  // Titles written from a finding before the audit spoke French were
  // stored in English: read them in the workspace language.
  const locale = await getLocale();
  const all = rows.map((task) => ({ ...task, title: taskTitle(task.title, locale) }));

  const clientRows = await db
    .select({
      id: clients.id,
      name: clients.name,
      localPath: clients.localPath,
      githubRepo: clients.githubRepo,
      prMode: clients.prMode,
      codeAgentEnabled: clients.codeAgentEnabled,
    })
    .from(clients)
    .where(scopeWhere)
    .orderBy(clients.name);
  const allClients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  // The client's code circuit (copy the prompt, Claude Code): owners and
  // managers only. Which clients may run Claude Code is decided here.
  const canUseCode = await mayUseClientCode();
  const codeViews = new Map(
    canUseCode ? clientRows.map((c) => [c.id, clientCodeView(c)] as const) : [],
  );
  const runnable = [...codeViews].filter(([, v]) => v.canRun).map(([id]) => id);
  const selected = onlyClient !== null ? clientRows.find((c) => c.id === onlyClient) ?? null : null;
  const selectedView = selected ? codeViews.get(selected.id) ?? null : null;
  const q = selected && selectedView?.canRun ? queueFor(selected.id) : null;
  const queueView: QueueView | null = q
    ? {
        active: q.active,
        total: q.total,
        attempted: q.attempted.length,
        failed: q.failed.length,
        current: q.current,
        currentTitle: all.find((task) => task.id === q.current)?.title ?? null,
        note: q.note?.code ?? null,
        noteReason: q.note?.code === "blocked" ? q.note.reason : null,
        batch: q.batchOutcome ?? null,
      }
    : null;

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
              href={`/tasks?filter=${filter}&view=list${onlyClient ? `&client=${onlyClient}` : ""}`}
              className={
                view === "list"
                  ? "inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-white/10"
                  : "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }
            >
              <List className="size-3" /> {t("list")}
            </Link>
            <Link
              href={`/tasks?filter=${filter}&view=kanban${onlyClient ? `&client=${onlyClient}` : ""}`}
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
            <FilterTabs current={filter} view={view} clientId={onlyClient} />
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

      {selected && selectedView && (
        <ClientCodePanel
          clientId={selected.id}
          clientName={selected.name}
          view={selectedView}
          openCount={all.filter((task) => task.clientId === selected.id && isOpenTask(task.status)).length}
          queue={queueView}
        />
      )}

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
        <TasksBulkList
          tasks={filtered as BulkTask[]}
          nowMs={nowMs}
          code={canUseCode ? { runnable } : null}
        />
      )}
    </div>
  );
}

async function FilterTabs({
  current,
  view,
  clientId,
}: {
  current: Filter;
  view: ViewMode;
  clientId: number | null;
}) {
  const t = await getTranslations("tasks");
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/5 p-0.5 ring-1 ring-inset ring-white/10">
      {(Object.keys(filterMap) as Filter[]).map((f) => (
        <Link
          key={f}
          href={`/tasks?filter=${f}&view=${view}${clientId ? `&client=${clientId}` : ""}`}
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
