"use client";

/**
 * The client's file, above a tool opened for it.
 *
 * "ND Prestige file · page /contact · ← back to the client / to the task",
 * then what the reader can do with what the tool showed them: add a task
 * to that client, or close the task they came from. Both go through the
 * server (lib/tool-context-actions.ts), which checks the client is theirs
 * to see and edit, and writes the line in the client's journal.
 *
 * Mounted once, by the project return bar in the root layout, on every
 * /tools/* page opened with `?clientId=` — no tool page has to remember
 * it. Nothing at all when the client is unknown or not the reader's.
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Check, CheckCircle2, FolderOpen, ListPlus, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import {
  addTaskFromTool,
  completeTaskFromTool,
  loadToolContext,
  verifyTaskFromTool,
  type VerifyFromToolResult,
  type ToolActionResult,
  type ToolContextView,
} from "@/lib/tool-context-actions";
import { toolSlug } from "@/lib/finding-tool-map";
import { cleanToolName } from "@/lib/tool-context";

type Priority = "high" | "medium" | "low";

export function ToolClientContext({ fallback }: { fallback: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const query = params?.toString() ?? "";
  const [loaded, setLoaded] = useState<{ query: string; view: ToolContextView | null } | null>(null);

  useEffect(() => {
    let alive = true;
    loadToolContext(query)
      .then((view) => {
        if (alive) setLoaded({ query, view });
      })
      .catch(() => {
        if (alive) setLoaded({ query, view: null });
      });
    return () => {
      alive = false;
    };
  }, [query]);

  // Until the server answers, the plain way back the bar always showed.
  if (!loaded || loaded.query !== query) return <>{fallback}</>;
  if (!loaded.view) return <>{fallback}</>;
  return <Banner key={query} view={loaded.view} query={query} toolPath={pathname} />;
}

function Banner({
  view,
  query,
  toolPath,
}: {
  view: ToolContextView;
  query: string;
  toolPath: string;
}) {
  const t = useTranslations("toolContext");
  const tCatalog = useTranslations("tools.catalog");
  const slug = toolSlug(toolPath);
  const toolName =
    slug && tCatalog.has(`${slug}.title`) ? cleanToolName(tCatalog(`${slug}.title`), slug) : (slug ?? "");

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(() => t("defaultTitle", { tool: toolName, page: view.pagePath }));
  const [priority, setPriority] = useState<Priority>("medium");
  const [addedId, setAddedId] = useState<number | null>(null);
  const [taskDone, setTaskDone] = useState(view.task?.done ?? false);
  const [checked, setChecked] = useState<Extract<VerifyFromToolResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();

  function report(result: ToolActionResult): boolean {
    if (result.ok) return true;
    toast.error(t(`errors.${result.error}`));
    return false;
  }

  function submitTask(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await addTaskFromTool({ query, toolPath, title, priority });
        if (report(res) && res.ok) {
          setAddedId(res.taskId);
          setAdding(false);
          toast.success(t("added", { client: view.client.name }));
        }
      } catch {
        toast.error(t("errors.generic"));
      }
    });
  }

  function completeTask() {
    startTransition(async () => {
      try {
        const res = await completeTaskFromTool({ query, toolPath });
        if (report(res)) {
          setTaskDone(true);
          toast.success(t("completed"));
        }
      } catch {
        toast.error(t("errors.generic"));
      }
    });
  }

  function verifyTask() {
    startTransition(async () => {
      try {
        const res = await verifyTaskFromTool({ query, toolPath });
        if (!res.ok) {
          toast.error(t(res.error === "not_checkable" ? "errors.notCheckable" : `errors.${res.error}`));
          return;
        }
        setChecked(res);
        if (res.taskDone) {
          setTaskDone(true);
          toast.success(t("completed"));
        } else {
          toast.message(t("checkedSummary", { resolved: res.resolved, still: res.stillPresent, unverifiable: res.unverifiable }));
        }
      } catch {
        toast.error(t("errors.generic"));
      }
    });
  }

  const tasksHref = `/tasks?client=${view.client.id}`;

  return (
    <section
      aria-label={t("aria")}
      className="mx-auto mb-4 w-full max-w-5xl rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 text-xs"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FolderOpen className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="font-semibold text-foreground">{t("folder", { client: view.client.name })}</span>
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="min-w-0 max-w-full truncate text-muted-foreground" title={view.url}>
          {t("page", { path: view.pagePath })}
        </span>
      </div>
      {view.task && (
        <p className="mt-1 break-words text-muted-foreground">
          {t("task", { title: view.task.title })}
          {taskDone && <span className="ml-1 text-emerald-400">{t("taskIsDone")}</span>}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={`/clients/${view.client.id}`}
          className="inline-flex min-h-8 items-center gap-1 font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-3 shrink-0" aria-hidden />
          {t("backToClient")}
        </Link>
        {view.task && (
          <Link
            href={`${tasksHref}#task-${view.task.id}`}
            className="inline-flex min-h-8 items-center gap-1 font-medium text-primary hover:underline"
          >
            <ArrowLeft className="size-3 shrink-0" aria-hidden />
            {t("backToTask")}
          </Link>
        )}

        {view.canEdit && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {view.task && !taskDone && view.canVerify && (
              // A finding the live page can confirm: checked, not believed
              // (lib/agent/close-loop.ts). The task closes once its pages are.
              <button
                type="button"
                disabled={pending}
                onClick={verifyTask}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ScanSearch className="size-3.5" />}
                {t("verifyTask")}
              </button>
            )}
            {view.task && !taskDone && !view.canVerify && (
              <button
                type="button"
                disabled={pending}
                onClick={completeTask}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                {t("completeTask")}
              </button>
            )}
            {!adding && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setAdding(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary/10 px-3 font-medium text-primary ring-1 ring-inset ring-primary/25 hover:bg-primary/20 disabled:opacity-50"
              >
                <ListPlus className="size-3.5" />
                {t("addTask", { client: view.client.name })}
              </button>
            )}
          </div>
        )}
      </div>

      {checked && (
        <p className="mt-2 text-muted-foreground" role="status">
          {t("checkedSummary", { resolved: checked.resolved, still: checked.stillPresent, unverifiable: checked.unverifiable })}
          {checked.taskDone && <span className="ml-1 text-emerald-400">{t("completed")}</span>}
        </p>
      )}

      {addedId !== null && !adding && (
        <p className="mt-2 inline-flex flex-wrap items-center gap-1 text-emerald-400">
          <Check className="size-3.5" aria-hidden />
          {t("added", { client: view.client.name })}
          <Link href={`${tasksHref}#task-${addedId}`} className="font-medium underline">
            {t("seeTask")}
          </Link>
        </p>
      )}

      {view.canEdit && adding && (
        <form onSubmit={submitTask} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block space-y-1">
            <span className="text-muted-foreground">{t("titleLabel")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={2}
              maxLength={200}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground">{t("priorityLabel")}</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm sm:w-auto"
            >
              <option value="high">{t("priority.high")}</option>
              <option value="medium">{t("priority.medium")}</option>
              <option value="low">{t("priority.low")}</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:flex-none"
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {t("submit")}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground ring-1 ring-inset ring-border hover:text-foreground"
            >
              {t("cancel")}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground sm:col-span-3">{t("journalNote")}</p>
        </form>
      )}
    </section>
  );
}
