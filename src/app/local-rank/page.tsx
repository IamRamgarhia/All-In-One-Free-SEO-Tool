export const dynamic = "force-dynamic";

import { MapPin } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function LocalRankIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = all.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    logoUrl: c.logoUrl,
    niche: c.niche,
    primary: c.address ? "Has NAP" : "No address yet",
    primaryTone: (c.address ? "emerald" : "amber") as "emerald" | "amber",
    secondary: "Click to check rankings by city",
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Local rank tracker"
        description="Pick a client. Check where they rank in different cities for the same keyword. Identifies geo-specific weaknesses for local SEO."
        icon={MapPin}
        accent="emerald"
      />
      <ClientToolGrid cards={cards} basePath="/local-rank/c" />
    </div>
  );
}
