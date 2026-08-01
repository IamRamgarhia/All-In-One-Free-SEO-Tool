export const dynamic = "force-dynamic";

import { Megaphone } from "lucide-react";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { AdsFunnelForm } from "./form";

export default async function AdsFunnelToolPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const params = await searchParams;
  const preselectClientId = params?.clientId ? Number(params.clientId) : null;

  const allClients = await db
    .select({
      id: clients.id,
      name: clients.name,
      url: clients.url,
      niche: clients.niche,
    })
    .from(clients)
    .where(await clientScope())
    .orderBy(desc(clients.createdAt));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Ad Funnel Architect"
        description="Multi-platform ad strategy + ready-to-paste copy."
        icon={Megaphone}
        accent="rose"
      />

      <AdsFunnelForm
        clients={allClients.map((c) => ({
          id: c.id,
          name: c.name,
          url: c.url,
          niche: c.niche,
        }))}
        preselectClientId={preselectClientId}
      />
    </div>
  );
}
