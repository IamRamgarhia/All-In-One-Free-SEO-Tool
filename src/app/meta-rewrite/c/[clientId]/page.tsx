export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { clientScope } from "@/lib/client-scope";
import { RewriteFlow } from "./rewrite-flow";

export default async function PerClientMetaRewritePage({
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/meta-rewrite/c"
        toolLabel="Meta rewrite"
        icon={Sparkles}
      />

      <PageHeader
        title={`Meta-rewrite · ${client.name}`}
        description="Pulls GSC data, finds pages with high impressions and below-expected CTR, AI rewrites the title + meta description, and (if WP is connected) pushes the winning version live with one click."
        icon={Sparkles}
        accent="violet"
      />

      <RewriteFlow
        clientId={client.id}
        wpConnected={Boolean(client.wpEndpoint && client.wpKey)}
      />
    </div>
  );
}
