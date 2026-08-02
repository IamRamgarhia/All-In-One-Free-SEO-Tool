export const dynamic = "force-dynamic";

import { Map } from "lucide-react";
import { db } from "@/db/client";
import { clients, localGridChecks } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function LocalGridIndexPage() {
  const all = await db.select().from(clients).where(await clientScope()).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(localGridChecks)
        .where(eq(localGridChecks.clientId, c.id));
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: total === 0 ? "No grids yet" : `${total} grid runs`,
        primaryTone: total > 0 ? "emerald" : "neutral",
        secondary:
          total > 0
            ? "Click to run / view"
            : "Click to map your local-pack visibility",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Local-pack heatmap"
        description="Sample your Google ranking from a 5×5 grid across the service area. See exactly where you rank in the 3-pack vs where you're invisible. Free, browser-mode (no paid SERP API)."
        icon={Map}
        accent="emerald"
      />
      <ClientToolGrid cards={cards} basePath="/local-grid/c" />
    </div>
  );
}
