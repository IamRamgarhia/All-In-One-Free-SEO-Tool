export const dynamic = "force-dynamic";

import { Search } from "lucide-react";
import { db } from "@/db/client";
import { clients, keywords, keywordRankings } from "@/db/schema";
import { desc, eq, count, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function KeywordsIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(keywords)
        .where(eq(keywords.clientId, c.id));

      let quickWinCount = 0;
      if (total > 0) {
        const kws = await db
          .select({ id: keywords.id })
          .from(keywords)
          .where(eq(keywords.clientId, c.id));
        if (kws.length > 0) {
          const latestRanks = await db
            .select()
            .from(keywordRankings)
            .where(
              inArray(
                keywordRankings.keywordId,
                kws.map((k) => k.id),
              ),
            )
            .orderBy(desc(keywordRankings.checkedAt));
          const seen = new Set<number>();
          for (const r of latestRanks) {
            if (seen.has(r.keywordId)) continue;
            seen.add(r.keywordId);
            if (r.position !== null && r.position >= 4 && r.position <= 15) {
              quickWinCount++;
            }
          }
        }
      }

      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: total === 0 ? "None tracked" : `${total} keyword${total === 1 ? "" : "s"}`,
        primaryTone: total > 0 ? "cyan" : "neutral",
        secondary:
          quickWinCount > 0
            ? `${quickWinCount} quick win${quickWinCount === 1 ? "" : "s"} ready`
            : total > 0
              ? "Click to manage"
              : "Click to track the first",
        badges: quickWinCount > 0
          ? [{ label: `${quickWinCount} QW`, tone: "amber" as const }]
          : undefined,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Keywords"
        description="Pick a client to research keywords, track ranks, and find quick wins."
        icon={Search}
        accent="cyan"
      />
      <ClientToolGrid cards={cards} basePath="/keywords/c" />
    </div>
  );
}
