export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { ArrowLeft, Building, ExternalLink } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { GbpRunner } from "./gbp-runner";

export default async function PerClientGbpPage({
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

  if (!client.gbpUrl) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/gbp"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          All clients
        </Link>
        <PageHeader
          title={`GBP · ${client.name}`}
          description="Add the Google Maps share link in client settings to enable scraping."
          icon={Building}
          accent="cyan"
        />
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No Google Business Profile URL on this client yet.
          </p>
          <Link
            href={`/clients/${client.id}/edit`}
            className="mt-3 inline-flex items-center gap-1 text-sm text-violet-300 hover:underline"
          >
            Add it on the edit page
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/gbp/c"
        toolLabel="GBP"
        icon={Building}
      />

      <PageHeader
        title={`GBP · ${client.name}`}
        description="Pull the public Google Business Profile, see recent reviews, draft AI replies you can paste into GBP."
        icon={Building}
        accent="cyan"
      />

      <GbpRunner clientId={client.id} clientName={client.name} />
    </div>
  );
}
