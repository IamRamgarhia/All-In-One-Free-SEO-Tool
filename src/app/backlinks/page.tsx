export const dynamic = "force-dynamic";

import { Link2 } from "lucide-react";
import { db } from "@/db/client";
import { backlinks, clients } from "@/db/schema";
import { desc, eq, count, and } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function BacklinksIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(backlinks)
        .where(eq(backlinks.clientId, c.id));
      const [{ value: active }] = await db
        .select({ value: count() })
        .from(backlinks)
        .where(
          and(eq(backlinks.clientId, c.id), eq(backlinks.status, "active")),
        );
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: total === 0 ? "None tracked" : `${total} link${total === 1 ? "" : "s"}`,
        primaryTone: total > 0 ? "emerald" : "neutral",
        secondary: total > 0 ? `${active} active` : "Click to add the first",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Backlinks"
        description="Pick a client to manage their backlink profile, mark lost/disavow, and generate disavow files."
        icon={Link2}
        accent="emerald"
      />
      <ClientToolGrid cards={cards} basePath="/backlinks/c" />
    </div>
  );
}
