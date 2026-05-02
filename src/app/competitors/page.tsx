export const dynamic = "force-dynamic";

import { Network } from "lucide-react";
import { db } from "@/db/client";
import { clients, competitors } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function CompetitorsIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(competitors)
        .where(eq(competitors.clientId, c.id));
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: total === 0 ? "None tracked" : `${total} competitor${total === 1 ? "" : "s"}`,
        primaryTone: total > 0 ? "rose" : "neutral",
        secondary: total > 0 ? "Click to view + add more" : "Click to add the first one",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Competitors"
        description="Pick a client to see who they're up against, with notes and SERP context per competitor."
        icon={Network}
        accent="rose"
      />
      <ClientToolGrid cards={cards} basePath="/competitors/c" />
    </div>
  );
}
