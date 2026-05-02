export const dynamic = "force-dynamic";

import { Send } from "lucide-react";
import { db } from "@/db/client";
import { clients, outreachContacts } from "@/db/schema";
import { desc, eq, count, and } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function OutreachIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(outreachContacts)
        .where(eq(outreachContacts.clientId, c.id));
      const [{ value: won }] = await db
        .select({ value: count() })
        .from(outreachContacts)
        .where(
          and(
            eq(outreachContacts.clientId, c.id),
            eq(outreachContacts.status, "won"),
          ),
        );
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: total === 0 ? "Empty" : `${total} contact${total === 1 ? "" : "s"}`,
        primaryTone: total > 0 ? "violet" : "neutral",
        secondary:
          won > 0 ? `${won} won` : total > 0 ? "Click to manage" : "Click to add the first",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Outreach"
        description="Pick a client to manage their outreach pipeline — prospects, contacted, replied, won, lost."
        icon={Send}
        accent="violet"
      />
      <ClientToolGrid cards={cards} basePath="/outreach/c" />
    </div>
  );
}
