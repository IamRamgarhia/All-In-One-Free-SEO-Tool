export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { desc, eq, asc } from "drizzle-orm";
import { Gauge } from "lucide-react";
import { db } from "@/db/client";
import { clients, cwvReports } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { CwvRunner, type CwvRow } from "./cwv-runner";

export default async function PerClientCwvPage({
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

  const reports = (await db
    .select()
    .from(cwvReports)
    .where(eq(cwvReports.clientId, clientId))
    .orderBy(desc(cwvReports.scannedAt))
    .limit(20)) as CwvRow[];

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
        basePath="/cwv/c"
        toolLabel="Core Web Vitals"
        icon={Gauge}
      />

      <PageHeader
        title={`Core Web Vitals · ${client.name}`}
        description="Free PageSpeed Insights scans. Run on the homepage + key landing pages, then drop the wins into your task list."
        icon={Gauge}
        accent="cyan"
      />

      <CwvRunner
        clientId={client.id}
        defaultUrl={client.url}
        reports={reports}
      />
    </div>
  );
}
