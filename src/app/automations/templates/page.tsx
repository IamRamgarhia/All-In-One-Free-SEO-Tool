export const dynamic = "force-dynamic";

import type { Tx } from "@/lib/tx";
import { getLocale, getTranslations } from "next-intl/server";
import { asc } from "drizzle-orm";
import {
  Bell,
  ListChecks,
  ScrollText,
  Sparkles,
  Workflow,
} from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import {
  workflowTemplates,
  type WorkflowTemplate,
} from "@/lib/workflow-templates";
import { WORKFLOW_TEMPLATES_FR } from "@/lib/workflow-templates.fr";
import { InstallTemplateForm } from "./install-form";

const categoryIcon: Record<WorkflowTemplate["category"], typeof Bell> = {
  alerts: Bell,
  tasks: ListChecks,
  logs: ScrollText,
};

const categoryTone: Record<WorkflowTemplate["category"], string> = {
  alerts: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  tasks: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  logs: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
};

const triggerLabel = (tx: Tx): Record<WorkflowTemplate["trigger"], string> => ({
  audit_completed: tx("auditCompleted"),
  audit_failed: tx("auditFailed"),
  score_drop: tx("scoreDrop"),
  page_change: tx("pageChange"),
  rank_drop: tx("rankDrop"),
});

const actionLabel = (tx: Tx): Record<WorkflowTemplate["action"]["kind"], string> => ({
  webhook: tx("slackDiscordWebhook"),
  create_task: tx("createTask"),
  log: tx("activityLog"),
});

export default async function WorkflowTemplatesPage() {
  const tx = await getTranslations("ui.app_automations_templates_page");
  const fr = (await getLocale()) === "fr";
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={tx("automationTemplates")}
        description={tx("oneClickInstallForThe")}
        icon={Workflow}
        accent="violet"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {workflowTemplates.map((tmpl) => {
          const Icon = categoryIcon[tmpl.category];
          const text = (fr && WORKFLOW_TEMPLATES_FR[tmpl.id]) || tmpl;
          return (
            <section
              key={tmpl.id}
              className="glass-apple relative overflow-hidden rounded-2xl p-5"
            >
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${categoryTone[tmpl.category]}`}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{text.name}</h3>
                      {tmpl.recommended && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-inset ring-violet-500/30">
                          <Sparkles className="size-2.5" />
                          {tx("recommended")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {text.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 rounded-xl bg-white/[0.02] px-3 py-2 text-[11px] ring-1 ring-inset ring-white/[0.04]">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground">{tx("when")}</span>
                    <span className="font-mono font-semibold text-foreground">
                      {triggerLabel(tx)[tmpl.trigger]}
                    </span>
                  </span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground">{tx("do")}</span>
                    <span className="font-mono font-semibold text-foreground">
                      {actionLabel(tx)[tmpl.action.kind]}
                    </span>
                  </span>
                </div>

                <InstallTemplateForm
                  template={tmpl}
                  clients={allClients}
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
