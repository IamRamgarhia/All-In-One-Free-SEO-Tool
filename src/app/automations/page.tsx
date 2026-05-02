import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  Workflow,
  Webhook,
  ListChecks,
  FileText,
  Power,
  PowerOff,
  X,
  ArrowRight,
} from "lucide-react";
import { db } from "@/db/client";
import { automations, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { NewAutomationForm } from "./new-form";
import { deleteAutomation, setAutomationEnabled } from "./actions";

const triggerLabels: Record<string, { label: string; tone: string }> = {
  audit_completed: {
    label: "Audit completed",
    tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  audit_failed: {
    label: "Audit failed",
    tone: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  },
  score_drop: {
    label: "Score dropped",
    tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
  page_change: {
    label: "Page changed",
    tone: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
  },
  rank_drop: {
    label: "Rank dropped",
    tone: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  },
};

const actionIcon = {
  webhook: Webhook,
  create_task: ListChecks,
  log: FileText,
} as const;

export default async function AutomationsPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
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
      createdAt: automations.createdAt,
      clientName: clients.name,
    })
    .from(automations)
    .leftJoin(clients, eq(automations.clientId, clients.id))
    .orderBy(desc(automations.createdAt));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Automations"
        description="When something happens — audits, score drops, page changes — trigger an action automatically. Like Zapier, but built into your tool."
        icon={Workflow}
        accent="fuchsia"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-white/10">
            {rows.filter((r) => r.enabled).length} active · {rows.length} total
          </span>
        }
      />

      <NewAutomationForm clients={allClients} />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          No automations yet. Try one like &ldquo;When score drops, create a
          high-priority task.&rdquo;
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <ul className="divide-y divide-white/5">
            {rows.map((r) => {
              const trig = triggerLabels[r.trigger] ?? {
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
                            paused
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
                            · all clients
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Ran {r.runCount} time{r.runCount === 1 ? "" : "s"}
                        {r.lastRunAt
                          ? ` · last ${r.lastRunAt.toLocaleString()}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <form action={toggleAction}>
                        <button
                          type="submit"
                          aria-label={r.enabled ? "Pause" : "Resume"}
                          title={r.enabled ? "Pause" : "Resume"}
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
                          aria-label="Delete"
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
