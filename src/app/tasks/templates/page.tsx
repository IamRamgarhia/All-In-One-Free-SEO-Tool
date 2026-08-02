export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  GraduationCap,
  LayoutTemplate,
  Rocket,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { playbooks, type Playbook } from "@/lib/niche-templates";
import { clientScope } from "@/lib/client-scope";
import { ApplyPlaybookForm } from "./apply-form";

const categoryIcon: Record<Playbook["category"], typeof Clock> = {
  weekly: Clock,
  monthly: Calendar,
  quarterly: Compass,
  launch: Rocket,
  recovery: ShieldAlert,
};

const categoryTone: Record<Playbook["category"], string> = {
  weekly: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  monthly: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  quarterly: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  launch: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  recovery: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

const priorityTone: Record<string, string> = {
  high: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  medium: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  low: "bg-white/5 text-muted-foreground ring-white/10",
};

export default async function TasksTemplatesPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Task playbooks"
        description="Prebuilt task bundles that work for any client, regardless of niche or stack. Apply one to a client and we'll create every task with staggered due dates."
        icon={LayoutTemplate}
        accent="violet"
      />

      {allClients.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          Add a client first — playbooks need a client to assign tasks to.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {playbooks.map((pb) => {
            const Icon = categoryIcon[pb.category];
            return (
              <section
                key={pb.id}
                className="glass-apple relative overflow-hidden rounded-2xl p-5"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${categoryTone[pb.category]}`}
                        >
                          <Icon className="size-3" />
                          {pb.category}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <TrendingUp className="size-3" />
                          ~{pb.estimatedHours}h
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-base font-semibold">
                        {pb.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {pb.description}
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-1 rounded-xl bg-white/[0.02] p-3 ring-1 ring-inset ring-white/[0.04]">
                    {pb.tasks.map((t, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-xs"
                      >
                        <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-muted-foreground/60" />
                        <span className="flex-1 truncate">{t.title}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1 ring-inset ${priorityTone[t.priority] ?? priorityTone.low}`}
                        >
                          {t.priority}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <ApplyPlaybookForm
                    playbookId={pb.id}
                    taskCount={pb.tasks.length}
                    clients={allClients}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="glass-apple relative overflow-hidden rounded-2xl p-5 text-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <GraduationCap className="size-5 text-violet-300" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold">
              Why playbooks vs. niche templates?
            </h2>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Playbooks</strong> are
              workflow-based — what you do every week / month / quarter
              regardless of the client. <strong className="text-foreground">Niche templates</strong>{" "}
              (auto-applied when you add a client) cover the launch checklist
              specific to local SEO, ecommerce, SaaS, blog, or services. Use
              both — niche for the kickoff, playbooks for ongoing rhythm.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
