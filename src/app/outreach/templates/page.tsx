export const dynamic = "force-dynamic";

import Link from "next/link";
import { Send, ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { clients, outreachTemplates } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { TEMPLATE_VARIABLES } from "@/lib/outreach";
import { clientScope } from "@/lib/client-scope";
import {
  deleteOutreachTemplate,
  seedDefaultTemplatesIfEmpty,
} from "../actions";
import { TemplateForm } from "./template-form";

export default async function OutreachTemplatesPage() {
  await seedDefaultTemplatesIfEmpty();

  const [templates, allClients] = await Promise.all([
    db
      .select()
      .from(outreachTemplates)
      .orderBy(desc(outreachTemplates.updatedAt)),
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(await clientScope())
      .orderBy(asc(clients.name)),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/outreach"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to outreach
      </Link>

      <PageHeader
        title="Outreach templates"
        description="Reusable email templates with variables. Use {{name}}, {{client_name}}, {{client_url}} and more — they get filled in per contact when you send."
        icon={Send}
        accent="violet"
      />

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <h2 className="text-base font-semibold">Available variables</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Drop these into the subject or body. Empty values render as blank.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <code
              key={v}
              className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10"
            >
              {`{{${v}}}`}
            </code>
          ))}
        </div>
      </section>

      <TemplateForm clients={allClients} />

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-base font-semibold">
            Saved templates ({templates.length})
          </h2>
        </header>
        {templates.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No templates yet. Create your first above.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {templates.map((t) => (
              <li key={t.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      {t.clientId ? (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-500/30">
                          {allClients.find((c) => c.id === t.clientId)?.name ??
                            `Client #${t.clientId}`}
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10">
                          Workspace-wide
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs font-mono text-muted-foreground">
                      {t.subject}
                    </p>
                    <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap rounded-md bg-black/20 p-2 text-[11px] text-muted-foreground">
                      {t.body.slice(0, 240)}
                      {t.body.length > 240 ? "…" : ""}
                    </pre>
                  </div>
                  <form action={deleteOutreachTemplate.bind(null, t.id)}>
                    <button
                      type="submit"
                      className="rounded-md bg-rose-500/10 px-2.5 py-1 text-[10px] font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
