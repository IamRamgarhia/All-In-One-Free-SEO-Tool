export const dynamic = "force-dynamic";

import { Building } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function GbpIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = all.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    logoUrl: c.logoUrl,
    niche: c.niche,
    primary: c.gbpUrl ? "GBP linked" : "Not linked",
    primaryTone: (c.gbpUrl ? "emerald" : "amber") as "emerald" | "amber",
    secondary: c.gbpUrl
      ? "Click to fetch reviews + drafts AI replies"
      : "Add GBP URL on the client page first",
    badges: c.gbpUrl
      ? [{ label: "Ready", tone: "emerald" as const }]
      : [{ label: "Setup needed", tone: "amber" as const }],
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Google Business Profile"
        description="Pick a client. Pull their public GBP page — rating, review count, hours, recent reviews — then have the AI draft personalized replies you can copy + paste back into GBP."
        icon={Building}
        accent="cyan"
      />
      <ClientToolGrid cards={cards} basePath="/gbp/c" />
    </div>
  );
}
