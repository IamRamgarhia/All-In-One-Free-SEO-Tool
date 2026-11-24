/**
 * "Work done" on the client's overview: tasks added from the tools and
 * tasks finished, with the date and the page. The value the agency added,
 * visible where the client's file is read, instead of on a journal page
 * nobody opens. See lib/work-done.ts.
 */

import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, History, ListPlus } from "lucide-react";
import { db } from "@/db/client";
import { activityLog, tasks } from "@/db/schema";
import { WORK_DONE_KINDS, workDoneItems } from "@/lib/work-done";
import { pagePathOf } from "@/lib/tool-context";

export async function WorkDonePanel({ clientId }: { clientId: number }) {
  const t = await getTranslations("clientPage.workDone");
  const locale = await getLocale();

  const rows = await db
    .select({
      id: activityLog.id,
      kind: activityLog.kind,
      message: activityLog.message,
      createdAt: activityLog.createdAt,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      pages: tasks.pages,
    })
    .from(activityLog)
    .leftJoin(tasks, and(eq(activityLog.entityType, "task"), eq(activityLog.entityId, tasks.id)))
    .where(and(eq(activityLog.clientId, clientId), inArray(activityLog.kind, [...WORK_DONE_KINDS])))
    .orderBy(desc(activityLog.createdAt))
    .limit(30);

  const items = workDoneItems(
    rows.map((r) => ({ ...r, pageUrl: r.pages?.[0]?.url ?? null })),
  );

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
      <header className="relative flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <History className="size-4 text-emerald-300" aria-hidden />
            {t("title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("hint")}</p>
        </div>
        <Link
          href={`/activity?client=${clientId}`}
          className="text-xs font-medium text-primary hover:underline"
        >
          {t("journal")}
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {items.map((r) => {
            const Icon = r.kind === "tool.task_added" ? ListPlus : CheckCircle2;
            const tone =
              r.kind === "tool.task_added"
                ? "text-amber-300"
                : r.kind === "tool.fix_checked"
                  ? "text-cyan-300"
                  : "text-emerald-300";
            return (
              <li key={r.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
                <div className="min-w-0 flex-1 space-y-0.5">
                  {r.entityType === "task" && r.entityId ? (
                    <Link
                      href={`/tasks?client=${clientId}#task-${r.entityId}`}
                      className="block break-words leading-snug hover:underline"
                    >
                      {r.message}
                    </Link>
                  ) : (
                    <p className="break-words leading-snug">{r.message}</p>
                  )}
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <time dateTime={r.createdAt.toISOString()}>
                      {r.createdAt.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                    </time>
                    {r.pageUrl && (
                      <span className="min-w-0 truncate" title={r.pageUrl}>
                        {t("page", { path: pagePathOf(r.pageUrl) })}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
