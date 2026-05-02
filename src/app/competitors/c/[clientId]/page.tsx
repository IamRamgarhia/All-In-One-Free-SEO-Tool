export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, asc } from "drizzle-orm";
import { Network, ExternalLink, X } from "lucide-react";
import { db } from "@/db/client";
import { clients, competitors } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { AddCompetitorForm } from "@/app/competitors/add-form";
import { deleteCompetitor } from "@/app/competitors/actions";

export default async function PerClientCompetitorsPage({
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
    .orderBy(asc(clients.name));

  const rows = await db
    .select()
    .from(competitors)
    .where(eq(competitors.clientId, clientId))
    .orderBy(desc(competitors.createdAt));

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
        basePath="/competitors/c"
        toolLabel="Competitors"
        icon={Network}
      />

      <PageHeader
        title={`Competitors · ${client.name}`}
        description="Track who this client is up against. We'll layer SERP overlap and content tracking on top in v2."
        icon={Network}
        accent="rose"
      />

      <AddCompetitorForm clients={[{ id: client.id, name: client.name }]} />

      {rows.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          No competitors tracked yet. Add a few above to start mapping the
          landscape.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <ul className="divide-y divide-white/5">
            {rows.map((c) => {
              const removeAction = deleteCompetitor.bind(null, c.id);
              return (
                <li
                  key={c.id}
                  className="px-5 py-4 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {c.url.replace(/^https?:\/\//, "")}
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                      {c.notes && (
                        <p className="text-xs text-muted-foreground">{c.notes}</p>
                      )}
                    </div>
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
                  <Link
                    href={`/clients/${client.id}`}
                    className="sr-only"
                  >
                    for {client.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
