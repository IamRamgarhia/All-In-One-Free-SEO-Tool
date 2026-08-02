export const dynamic = "force-dynamic";

import { Network } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { PlaybookForm } from "./playbook-form";

export default async function CompetitorPlaybookPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Competitor playbook"
        description="Reverse-engineer any competitor's SEO strategy. Crawls their public site, extracts content silos, detects their tech stack, and generates a punch list of what they do that you don't."
        icon={Network}
        accent="violet"
      />
      <PlaybookForm clients={allClients} />
    </div>
  );
}
