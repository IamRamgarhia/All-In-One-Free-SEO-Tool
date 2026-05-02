export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { desc, eq, asc } from "drizzle-orm";
import { Bot } from "lucide-react";
import { db } from "@/db/client";
import { clients, aiSuggestions } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { configuredProviders, getActiveProvider } from "@/lib/api-keys";
import {
  SuggestionsList,
  type SuggestionRow,
} from "./suggestions-list";

export default async function PerClientAgentPage({
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
    .from(aiSuggestions)
    .where(eq(aiSuggestions.clientId, clientId))
    .orderBy(desc(aiSuggestions.createdAt));

  // Sort: new first (high priority first), then applied, then dismissed
  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  const statusRank = { new: 0, applied: 1, dismissed: 2 } as const;
  const suggestions: SuggestionRow[] = rows
    .map((r) => ({
      id: r.id,
      type: r.type,
      priority: r.priority,
      targetUrl: r.targetUrl,
      currentValue: r.currentValue,
      suggestedValue: r.suggestedValue,
      rationale: r.rationale,
      source: r.source,
      status: r.status,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => {
      const s = statusRank[a.status] - statusRank[b.status];
      if (s !== 0) return s;
      const p = priorityRank[a.priority] - priorityRank[b.priority];
      if (p !== 0) return p;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  const active = await getActiveProvider();
  const { byId } = await configuredProviders();
  const aiReady = Boolean(active && byId[active]);

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
        basePath="/agent/c"
        toolLabel="AI agent"
        icon={Bot}
      />

      <PageHeader
        title={`AI agent · ${client.name}`}
        description="Click run. The agent reads the latest audit + Search Console data, then drafts specific title rewrites, meta descriptions, quick-win actions, and content ideas."
        icon={Bot}
        accent="violet"
      />

      <SuggestionsList
        clientId={client.id}
        initialSuggestions={suggestions}
        aiReady={aiReady}
      />
    </div>
  );
}
