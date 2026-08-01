export const dynamic = "force-dynamic";

import { Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function MetaRewriteIndexPage() {
  const all = await db.select().from(clients).where(await clientScope()).orderBy(desc(clients.createdAt));
  const cards: ClientToolCard[] = all.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    logoUrl: c.logoUrl,
    niche: c.niche,
    primary: c.gscProperty ? "Ready" : "GSC needed",
    primaryTone: (c.gscProperty ? "emerald" : "amber") as "emerald" | "amber",
    secondary: c.gscProperty
      ? "Click to find low-CTR pages"
      : "Connect GSC first",
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Meta-rewrite batch"
        description="Find pages that get impressions but few clicks. AI rewrites the title + meta description grounded in the queries Google's already showing your page for. One-click push via the WordPress bridge."
        icon={Sparkles}
        accent="violet"
      />
      <ClientToolGrid cards={cards} basePath="/meta-rewrite/c" />
    </div>
  );
}
