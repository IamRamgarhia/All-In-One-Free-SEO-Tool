export const dynamic = "force-dynamic";

import { Layers } from "lucide-react";
import { db } from "@/db/client";
import { clients, keywords } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function TopicClustersIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: kwCount }] = await db
        .select({ value: count() })
        .from(keywords)
        .where(eq(keywords.clientId, c.id));
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary:
          kwCount === 0
            ? "No keywords"
            : `${kwCount} keyword${kwCount === 1 ? "" : "s"}`,
        primaryTone: kwCount > 0 ? ("violet" as const) : ("neutral" as const),
        secondary:
          kwCount >= 5
            ? "Click to see clusters"
            : "Track ≥5 keywords for clustering",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Topic clusters"
        description="Pick a client. Auto-groups tracked keywords by shared topic — surfaces natural pillar / supporting structure for internal linking."
        icon={Layers}
        accent="violet"
      />
      <ClientToolGrid cards={cards} basePath="/topic-clusters/c" />
    </div>
  );
}
