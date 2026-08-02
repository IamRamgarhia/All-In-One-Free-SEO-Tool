export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, asc } from "drizzle-orm";
import { Send, ExternalLink, X, FileText } from "lucide-react";
import { db } from "@/db/client";
import { clients, outreachContacts } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { AddOutreachForm } from "@/app/outreach/add-form";
import { ComposeButton } from "@/app/outreach/compose-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  setContactStatus,
  deleteOutreachContact,
  loadTemplatesForClient,
} from "@/app/outreach/actions";
import { getSmtpConfig } from "@/lib/mailer";
import { ClientInfoCard } from "@/components/client-info-card";
import { GmailScopeBanner } from "@/components/gmail-scope-banner";
import { clientScope } from "@/lib/client-scope";

const statusTone: Record<string, string> = {
  prospect: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  contacted: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  replied: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  won: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  lost: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

const STATUSES = ["prospect", "contacted", "replied", "won", "lost"] as const;

export default async function PerClientOutreachPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const rows = await db
    .select()
    .from(outreachContacts)
    .where(eq(outreachContacts.clientId, clientId))
    .orderBy(desc(outreachContacts.updatedAt));

  const [templates, smtp] = await Promise.all([
    loadTemplatesForClient(clientId),
    getSmtpConfig(),
  ]);
  const smtpConfigured = Boolean(smtp);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/outreach/c"
        toolLabel="Outreach"
        icon={Send}
      />

      <PageHeader
        title={`Outreach · ${client.name}`}
        description="Manage the outreach pipeline: prospects, contacted, replied, won, lost."
        icon={Send}
        accent="violet"
        meta={
          <Link
            href="/outreach/templates"
            className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
          >
            <FileText className="size-3.5" />
            Manage templates
          </Link>
        }
      />

      {!smtpConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          SMTP isn&apos;t configured yet — you can add contacts now, but
          sending email is disabled until you{" "}
          <Link
            href="/settings#smtp"
            className="underline hover:text-amber-100"
          >
            connect SMTP in settings
          </Link>
          .
        </div>
      )}

      <GmailScopeBanner />

      <ClientInfoCard
        info={{
          name: client.name,
          url: client.url,
          email: client.email,
          phone: client.phone,
          address: client.address,
          description: client.description,
          city: client.city,
          country: client.country,
          businessType: client.businessType,
          shortDescription: client.description?.split(".")[0] ?? null,
        }}
      />

      <AddOutreachForm clients={[{ id: client.id, name: client.name }]} />

      {rows.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl">
          <EmptyState
            icon={Send}
            title="No outreach contacts yet"
            body="Add prospects above to start tracking your link-building / guest-post / digital-PR pipeline. Templates, status, and click-tracking included."
          />
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <ul className="divide-y divide-white/5">
            {rows.map((c) => {
              const removeAction = deleteOutreachContact.bind(null, c.id);
              return (
                <li
                  key={c.id}
                  className="px-5 py-4 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusTone[c.status]}`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            className="hover:text-foreground hover:underline"
                          >
                            {c.email}
                          </a>
                        )}
                        {c.website && (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                          >
                            {c.website.replace(/^https?:\/\//, "")}
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      {c.notes && (
                        <p className="text-xs text-muted-foreground">{c.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {c.email && (
                        <ComposeButton
                          contact={{
                            id: c.id,
                            name: c.name,
                            email: c.email,
                            website: c.website,
                          }}
                          templates={templates.map((t) => ({
                            id: t.id,
                            name: t.name,
                            subject: t.subject,
                            body: t.body,
                          }))}
                          smtpConfigured={smtpConfigured}
                        />
                      )}
                      {STATUSES.filter((s) => s !== c.status).map((s) => {
                        const action = setContactStatus.bind(null, c.id, s);
                        return (
                          <form key={s} action={action}>
                            <button
                              type="submit"
                              className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                            >
                              → {s}
                            </button>
                          </form>
                        );
                      })}
                      <form action={removeAction}>
                        <button
                          type="submit"
                          aria-label="Remove"
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
        </section>
      )}
    </div>
  );
}
