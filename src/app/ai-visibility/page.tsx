export const dynamic = "force-dynamic";

import { Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { clients, keywords, aiVisibilityChecks } from "@/db/schema";
import { desc, eq, count, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function AIVisibilityIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: kwCount }] = await db
        .select({ value: count() })
        .from(keywords)
        .where(eq(keywords.clientId, c.id));

      let mentions = 0;
      if (kwCount > 0) {
        const kws = await db
          .select({ id: keywords.id })
          .from(keywords)
          .where(eq(keywords.clientId, c.id));
        if (kws.length > 0) {
          const checks = await db
            .select()
            .from(aiVisibilityChecks)
            .where(
              inArray(
                aiVisibilityChecks.keywordId,
                kws.map((k) => k.id),
              ),
            );
          mentions = checks.filter((c) => c.mentionsDomain).length;
        }
      }

      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary:
          mentions > 0 ? `${mentions} mentions` : kwCount > 0 ? "No mentions yet" : "No keywords",
        primaryTone: mentions > 0 ? "emerald" : "neutral",
        secondary:
          kwCount > 0
            ? `${kwCount} tracked keyword${kwCount === 1 ? "" : "s"}`
            : "Add keywords first",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="AI visibility"
        description="Pick a client to track whether ChatGPT, Claude, Gemini, Perplexity and others mention their domain on tracked queries."
        icon={Sparkles}
        accent="rose"
      />
      <ClientToolGrid cards={cards} basePath="/ai-visibility/c" />
    </div>
  );
}
