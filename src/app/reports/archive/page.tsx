export const dynamic = "force-dynamic";

import { desc, eq } from "drizzle-orm";
import { FileDown } from "lucide-react";
import { db } from "@/db/client";
import { clients, reportArchives } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { ArchiveClient } from "./client";

type SearchParams = { client?: string };

export default async function ReportArchivePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const clientFilter = sp.client ? Number(sp.client) : null;

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);

  let q = db
    .select({
      id: reportArchives.id,
      clientId: reportArchives.clientId,
      title: reportArchives.title,
      template: reportArchives.template,
      periodStart: reportArchives.periodStart,
      periodEnd: reportArchives.periodEnd,
      pdfBytes: reportArchives.pdfBytes,
      pinned: reportArchives.pinned,
      createdAt: reportArchives.createdAt,
      clientName: clients.name,
    })
    .from(reportArchives)
    .leftJoin(clients, eq(reportArchives.clientId, clients.id))
    .$dynamic();
  if (clientFilter !== null)
    q = q.where(eq(reportArchives.clientId, clientFilter));
  const archives = await q
    .orderBy(desc(reportArchives.pinned), desc(reportArchives.createdAt))
    .limit(200);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Report archive"
        description="Every monthly client report you've generated is stored here. Re-download as PDF anytime, pin the ones you want to keep, delete the rest."
        icon={FileDown}
        accent="cyan"
      />
      <ArchiveClient
        archives={archives}
        clients={allClients}
        currentClient={clientFilter}
      />
    </div>
  );
}
