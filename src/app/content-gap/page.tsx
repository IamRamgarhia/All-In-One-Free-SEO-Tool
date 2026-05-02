export const dynamic = "force-dynamic";

import { GitCompare } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function ContentGapIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = all.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    logoUrl: c.logoUrl,
    niche: c.niche,
    primary: c.gscProperty ? "Ready" : "GSC needed",
    primaryTone: (c.gscProperty ? "emerald" : "amber") as "emerald" | "amber",
    secondary: c.gscProperty
      ? "Click to find under-performing keywords"
      : "Connect GSC on this client first",
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Content gap finder"
        description="Pick a client. Find queries where you're being shown but losing the click — the highest-leverage content to refresh."
        icon={GitCompare}
        accent="cyan"
      />
      <ClientToolGrid cards={cards} basePath="/content-gap/c" />
    </div>
  );
}
