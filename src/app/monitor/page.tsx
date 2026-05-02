export const dynamic = "force-dynamic";

import { Activity } from "lucide-react";
import { db } from "@/db/client";
import { clients, monitoredPages } from "@/db/schema";
import { desc, eq, count, and } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function MonitorIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(monitoredPages)
        .where(eq(monitoredPages.clientId, c.id));
      const [{ value: active }] = await db
        .select({ value: count() })
        .from(monitoredPages)
        .where(
          and(
            eq(monitoredPages.clientId, c.id),
            eq(monitoredPages.status, "active"),
          ),
        );
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: total === 0 ? "Not monitoring" : `${total} page${total === 1 ? "" : "s"}`,
        primaryTone: total > 0 ? "violet" : "neutral",
        secondary: total > 0 ? `${active} active` : "Click to monitor a page",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Page monitor"
        description="Pick a client to track meta titles, descriptions, H1s, canonicals, and content changes on key pages."
        icon={Activity}
        accent="violet"
      />
      <ClientToolGrid cards={cards} basePath="/monitor/c" />
    </div>
  );
}
