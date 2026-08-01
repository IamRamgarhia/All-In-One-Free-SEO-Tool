export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { Globe } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { KnowledgePanelClient } from "./client";

export default async function KnowledgePanelIndexPage() {
  const all = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Knowledge Panel monitor"
        description="Capture Google's brand Knowledge Panel for any client and diff against the prior snapshot. Surfaces description changes, Wikipedia/Crunchbase additions/removals, social profile shuffles — every E-E-A-T-relevant entity edit Google made about your brand."
        icon={Globe}
        accent="violet"
      />
      <KnowledgePanelClient clients={all} />
    </div>
  );
}
