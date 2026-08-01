export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { GitMerge } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolGrid } from "@/components/shell/client-tool-grid";
import { clientScope } from "@/lib/client-scope";

export default async function CannibalizationPickerPage() {
  const allClients = await db
    .select({
      id: clients.id,
      name: clients.name,
      url: clients.url,
      logoUrl: clients.logoUrl,
      niche: clients.niche,
      gscProperty: clients.gscProperty,
    })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Keyword cannibalization"
        description="Finds queries where two or more of your pages are competing in the SERP. Splitting clicks across duplicate pages confuses Google about which URL is the canonical answer — consolidate or differentiate."
        icon={GitMerge}
        accent="rose"
      />
      <ClientToolGrid
        cards={allClients.map((c) => ({
          id: c.id,
          name: c.name,
          url: c.url,
          logoUrl: c.logoUrl,
          niche: c.niche,
          primary: c.gscProperty ? "GSC connected" : "GSC needed",
          primaryTone: c.gscProperty ? "emerald" : "amber",
          badges: c.gscProperty
            ? [{ label: "Ready to scan", tone: "emerald" }]
            : [{ label: "Connect GSC first", tone: "amber" }],
        }))}
        basePath="/cannibalization/c"
        emptyHint="Connect Google Search Console for a client first — cannibalization is detected from real per-query, per-page GSC data."
      />
    </div>
  );
}
