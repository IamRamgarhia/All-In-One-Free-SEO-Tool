export const dynamic = "force-dynamic";

import { getTranslations } from "next-intl/server";
import { desc } from "drizzle-orm";
import { Inbox } from "lucide-react";
import { db } from "@/db/client";
import { graderLeads } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { LeadsInbox } from "./inbox";
import { EmbedSnippet } from "./embed-snippet";
import { LocalProspecting } from "./local-prospecting";
import { serpApiConfig } from "@/lib/serp-api";

export default async function LeadsPage() {
  const tx = await getTranslations("ui.app_leads_page");
  const rows = await db
    .select()
    .from(graderLeads)
    .orderBy(desc(graderLeads.createdAt))
    .limit(200);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={tx("leads")}
        description={tx("peopleWhoRanYourFree")}
        icon={Inbox}
        accent="emerald"
      />

      <LocalProspecting hasSerpApi={Boolean(await serpApiConfig())} />

      <EmbedSnippet />

      <LeadsInbox
        leads={rows.map((l) => ({
          id: l.id,
          url: l.url,
          email: l.email,
          name: l.name,
          score: l.score,
          criticalCount: l.criticalCount,
          highCount: l.highCount,
          findings: l.findingsJson ?? [],
          status: l.status,
          notes: l.notes,
          sourcePage: l.sourcePage,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
