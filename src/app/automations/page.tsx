import type { Tx } from "@/lib/tx";
import { getTranslations, getLocale } from "next-intl/server";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Workflow,
  Webhook,
  ListChecks,
  FileText,
  LayoutTemplate,
  Power,
  PowerOff,
  X,
  ArrowRight,
  Sparkles,
  CalendarClock,
} from "lucide-react";
import { db } from "@/db/client";
import { automationRuns, automations, clients } from "@/db/schema";
import { RunNowButton } from "./run-now-button";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { NewAutomationForm } from "./new-form";
import { WebhookTester } from "./webhook-tester";
import { deleteAutomation, setAutomationEnabled } from "./actions";
import { getSetting } from "@/lib/settings-store";
import { clientScope } from "@/lib/client-scope";

const triggerLabels = (tx: Tx): Record<string, { label: string; tone: string }> => ({
  audit_completed: {
    label: tx("auditCompleted"),
    tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  audit_failed: {
    label: tx("auditFailed"),
    tone: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  },
  score_drop: {
    label: tx("scoreDropped"),
    tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
  page_change: {
    label: tx("pageChanged"),
    tone: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
  },
  rank_drop: {
    label: tx("rankDropped"),
    tone: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  },
  schedule: {
    label: tx("scheduled"),
    tone: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
});

const actionIcon = {
  webhook: Webhook,
  create_task: ListChecks,
  log: FileText,
  ai_step: Sparkles,
} as const;

export default async function AutomationsPage() {
  const tx = await getTranslations("ui.app_automations_page");
  const locale = await getLocale();
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);

  const rows = await db
    .select({
      id: automations.id,
      name: automations.name,
      trigger: automations.trigger,
      clientId: automations.clientId,
      actions: automations.actions,
      enabled: automations.enabled,
      lastRunAt: automations.lastRunAt,
      runCount: automations.runCount,
      schedule: automations.schedule,
      nextRunAt: automations.nextRunAt,
      failures: automations.failures,
      createdAt: automations.createdAt,
      clientName: clients.name,
    })
    .from(automations)
    .leftJoin(clients, eq(automations.clientId, clients.id))
    .orderBy(desc(automations.createdAt));

  // The last runs of AI steps, newest first, three per automation.
  const recentRuns = await db
    .select({
      id: automationRuns.id,
      automationId: automationRuns.automationId,
      status: automationRuns.status,
      output: automationRuns.output,
      error: automationRuns.error,
      startedAt: automationRuns.startedAt,
      clientName: clients.name,
    })
    .from(automationRuns)
    .leftJoin(clients, eq(automationRuns.clientId, clients.id))
    .orderBy(desc(automationRuns.startedAt), desc(automationRuns.id))
    .limit(300);
  const runsOf = (id: number) => recentRuns.filter((r) => r.automationId === id).slice(0, 3);

  const savedWebhook =
    (await getSetting<string>("webhook.url").catch(() => null)) ?? "";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={tx("automations")}
        description={tx("whenSomethingHappensAuditsScore")}
        icon={Workflow}
        accent="fuchsia"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/automations/overview"
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 transition-colors hover:bg-cyan-500/20"
            >
              <Workflow className="size-3.5" />
              {tx("whatSAutomated")}
            </Link>
            <Link
              href="/automations/templates"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <LayoutTemplate className="size-3.5" />
              {tx("templates")}
            </Link>
          </div>
        }
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-white/10">
            {tx("activeTotal", { length: rows.filter((r) => r.enabled).length, length2: rows.length })}
          </span>
        }
      />

      <WebhookTester defaultUrl={savedWebhook} />

      <NewAutomationForm clients={allClients} />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <EmptyState
            icon={Workflow}
            title={tx("noAutomationsYet")}
            body={tx("ifThisThenThatRules")}
            primary={{ href: "/automations/templates", label: tx("browse8Templates") }}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <ul className="divide-y divide-white/5">
            {rows.map((r) => {
              const trig = triggerLabels(tx)[r.trigger] ?? {
                label: r.trigger,
                tone: "bg-white/5 text-muted-foreground ring-white/10",
              };
              const removeAction = deleteAutomation.bind(null, r.id);
              const toggleAction = setAutomationEnabled.bind(
                null,
                r.id,
                !r.enabled,
              );
              return (
                <li
                  key={r.id}
                  className={
                    r.enabled
                      ? "px-5 py-4 transition-colors hover:bg-white/[0.03]"
                      : "px-5 py-4 opacity-60 transition-colors hover:bg-white/[0.03] hover:opacity-100"
                  }
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{r.name}</span>
                        {!r.enabled && (
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10">
                            {tx("paused")}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${trig.tone}`}
                        >
                          {trig.label}
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground" />
                        {r.actions.map((a, i) => {
                          const Icon = actionIcon[a.kind];
                          let label = "";
                          if (a.kind === "webhook")
                            label = `webhook → ${a.url.replace(/^https?:\/\//, "").slice(0, 40)}…`;
                          else if (a.kind === "create_task")
                            label = `task: "${a.title.slice(0, 40)}…"`;
                          else if (a.kind === "ai_step")
                            label = `${tx("aiStep")} → ${tx(`deliverables.${a.deliverable}`)}`;
                          else label = `log: "${a.message.slice(0, 40)}…"`;
                          return (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 font-medium text-foreground/85 ring-1 ring-inset ring-white/10"
                            >
                              <Icon className="size-3" />
                              {label}
                            </span>
                          );
                        })}
                        {r.clientName ? (
                          <span className="text-muted-foreground">
                            · {r.clientName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {tx("allClients")}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {tx("ranOther", { runCount: r.runCount })}
                        {r.lastRunAt
                          ? ` · last ${r.lastRunAt.toLocaleString(locale)}`
                          : ""}
                      </div>
                      {r.schedule ? (
                        <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <CalendarClock className="size-3" />
                          {tx(`every.${r.schedule.every}`, { hour: r.schedule.hour, day: r.schedule.day ?? 1 })} ({r.schedule.tz})
                          {r.enabled && r.nextRunAt ? ` · ${tx("nextRun", { when: r.nextRunAt.toLocaleString(locale) })}` : ""}
                        </div>
                      ) : null}
                      {r.failures > 0 ? (
                        <div className="text-[11px] text-amber-600 dark:text-amber-300">{tx("failures", { count: r.failures })}</div>
                      ) : null}
                      {r.actions.some((a) => a.kind === "ai_step") && runsOf(r.id).length > 0 ? (
                        <ul className="m-0 list-none space-y-1 p-0">
                          {runsOf(r.id).map((run) => (
                            <li key={run.id} className="text-xs">
                              <details>
                                <summary className="cursor-pointer text-muted-foreground">
                                  <span className={run.status === "ok" ? "text-emerald-600 dark:text-emerald-400" : run.status === "running" ? "" : "text-rose-500"}>
                                    {tx(`runStatus.${run.status === "ok" || run.status === "running" ? run.status : "error"}`)}
                                  </span>
                                  {" · "}
                                  {run.startedAt.toLocaleString(locale)}
                                  {run.clientName ? ` · ${run.clientName}` : ""}
                                </summary>
                                <div className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-white/5 p-2 text-[12px] leading-relaxed">
                                  {run.output ?? run.error ?? "—"}
                                </div>
                              </details>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {r.actions.some((a) => a.kind === "ai_step") ? <RunNowButton id={r.id} /> : null}
                      <form action={toggleAction}>
                        <button
                          type="submit"
                          aria-label={r.enabled ? tx("pause") : tx("resume")}
                          title={r.enabled ? tx("pause") : tx("resume")}
                          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                        >
                          {r.enabled ? (
                            <PowerOff className="size-3.5" />
                          ) : (
                            <Power className="size-3.5" />
                          )}
                        </button>
                      </form>
                      <form action={removeAction}>
                        <button
                          type="submit"
                          aria-label={tx("delete")}
                          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <X className="size-3.5" />
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
