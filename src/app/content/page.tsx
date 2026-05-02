export const dynamic = "force-dynamic";

import { FileText } from "lucide-react";
import { db } from "@/db/client";
import { clients, contentBriefs } from "@/db/schema";
import { desc, eq, count, and } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function ContentIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(contentBriefs)
        .where(eq(contentBriefs.clientId, c.id));
      const [{ value: published }] = await db
        .select({ value: count() })
        .from(contentBriefs)
        .where(
          and(
            eq(contentBriefs.clientId, c.id),
            eq(contentBriefs.status, "published"),
          ),
        );
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: total === 0 ? "No briefs" : `${total} brief${total === 1 ? "" : "s"}`,
        primaryTone: total > 0 ? "emerald" : "neutral",
        secondary: total > 0 ? `${published} published` : "Click to generate the first",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Content"
        description="Pick a client to generate content briefs from real SERP scraping + heading aggregation."
        icon={FileText}
        accent="emerald"
      />
      <ClientToolGrid cards={cards} basePath="/content/c" />
    </div>
  );
}
