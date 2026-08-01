export const dynamic = "force-dynamic";

import { Megaphone } from "lucide-react";
import { db } from "@/db/client";
import { brandMentions, clients } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function BrandMonitorIndexPage() {
  const all = await db.select().from(clients).where(await clientScope()).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(brandMentions)
        .where(eq(brandMentions.clientId, c.id));
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: total === 0 ? "Not scanned" : `${total} mentions`,
        primaryTone: total > 0 ? "violet" : "neutral",
        secondary:
          total > 0
            ? "Click to review"
            : "Click to scan Reddit, HackerNews, Bluesky, Mastodon",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Brand monitoring"
        description="Daily scan across Reddit, HackerNews, Bluesky, and Mastodon for mentions of each client. Surfaces unlinked-mention link-building opportunities + sentiment trends. Free, no API keys."
        icon={Megaphone}
        accent="amber"
      />
      <ClientToolGrid cards={cards} basePath="/brand-monitor/c" />
    </div>
  );
}
