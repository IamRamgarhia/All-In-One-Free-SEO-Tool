export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, CalendarRange, Download } from "lucide-react";
import { db } from "@/db/client";
import { clients, tasks } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { groupPlanByWeek } from "@/lib/plan-view";

/**
 * The 30-day plan, as a plan.
 *
 * Onboarding says "generated 30 tasks under plan-2026-09-12" and links to
 * the tasks board, where those thirty land as undifferentiated rows among
 * everything else — due dates spread across a month, no grouping, nothing
 * naming the plan they came from. The work was there and the plan was
 * not, which is the difference between a schedule somebody follows and a
 * backlog they scroll past.
 *
 * Deliberately read-only. Ticking items off belongs on the tasks board,
 * which already does it well; this is the view you send a client and the
 * one you open on a Monday to see what the month looks like.
 */
export default async function ClientPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = Number.parseInt(id, 10);
  if (!Number.isInteger(clientId)) notFound();

  const [client] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      whyItMatters: tasks.whyItMatters,
      status: tasks.status,
      dueDate: tasks.dueDate,
      estimatedMinutes: tasks.estimatedMinutes,
      sourceRef: tasks.sourceRef,
    })
    .from(tasks)
    .where(and(eq(tasks.clientId, clientId), eq(tasks.source, "auto_calendar")))
    .orderBy(asc(tasks.dueDate));

  const plan = groupPlanByWeek(rows);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/clients/${clientId}`}
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Back to {client.name}
        </Link>
        <PageHeader
          title="The 30-day plan"
          description={`What happens in which week for ${client.name}, in the order it was scheduled. Tick items off on the tasks board — this is the view to read, and the one to send.`}
          icon={CalendarRange}
          accent="violet"
        />
      </div>

      {plan.weeks.length === 0 ? (
        <div className="glass-apple rounded-2xl p-6">
          <p className="text-sm text-muted-foreground">
            No plan yet. Run smart onboarding for this client and it will
            generate thirty days of work with due dates.
          </p>
          <Link
            href={`/clients/${clientId}/onboarding`}
            className="mt-3 inline-block text-xs text-primary hover:underline"
          >
            Open smart onboarding
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-semibold">
              {plan.done} of {plan.total} done
            </span>
            <span className="text-xs text-muted-foreground">
              about {Math.round(plan.totalMinutes / 60)} hours across{" "}
              {plan.weeks.length} week{plan.weeks.length === 1 ? "" : "s"}
            </span>
            <a
              href={`/clients/${clientId}/plan/export.csv`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs hover:bg-muted/70"
            >
              <Download className="size-3.5" />
              Download as CSV
            </a>
            <Link
              href={`/tasks?client=${clientId}`}
              className="text-xs text-primary hover:underline"
            >
              Open on the tasks board
            </Link>
          </div>

          {plan.weeks.map((w) => (
            <section
              key={w.label}
              className="glass-apple overflow-hidden rounded-2xl"
            >
              <header className="flex flex-wrap items-baseline gap-x-3 border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-semibold">{w.label}</h2>
                <span className="text-[11px] text-muted-foreground">
                  {w.range}
                </span>
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                  {w.items.filter((t) => t.status === "done").length} of{" "}
                  {w.items.length} done
                </span>
              </header>
              <ul className="divide-y divide-border">
                {w.items.map((t) => (
                  <li key={t.id} className="flex gap-3 px-4 py-3">
                    <span
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        t.status === "done" ? "bg-emerald-500" : "bg-muted-foreground/40"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[13px] font-medium leading-tight ${
                          t.status === "done"
                            ? "text-muted-foreground line-through"
                            : ""
                        }`}
                      >
                        {t.title}
                      </span>
                      {t.whyItMatters && (
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                          {t.whyItMatters}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                      <span className="block tabular-nums">{t.dueLabel}</span>
                      {t.estimatedMinutes ? (
                        <span className="block opacity-70">
                          {t.estimatedMinutes}m
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
