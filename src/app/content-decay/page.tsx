export const dynamic = "force-dynamic";

import { TrendingDown } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function ContentDecayIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = all.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    logoUrl: c.logoUrl,
    niche: c.niche,
    primary: c.gscProperty ? "GSC linked" : "GSC needed",
    primaryTone: (c.gscProperty ? "emerald" : "amber") as "emerald" | "amber",
    secondary: c.gscProperty
      ? "Click to find pages losing traffic"
      : "Connect Google Search Console first",
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Content decay detector"
        description="Pick a client. Find pages that are losing traffic vs. the prior 28-day window — ranked by recovery value, so you focus on the highest-leverage rewrites."
        icon={TrendingDown}
        accent="amber"
      />
      <ClientToolGrid cards={cards} basePath="/content-decay/c" />
    </div>
  );
}
