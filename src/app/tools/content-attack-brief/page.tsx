import { desc } from "drizzle-orm";
import { Target } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ContentAttackBriefForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ContentAttackBriefPage() {
  const allClients = await db
    .select({
      id: clients.id,
      name: clients.name,
      gscProperty: clients.gscProperty,
    })
    .from(clients)
    .orderBy(desc(clients.createdAt));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Content attack brief"
        description="Pulls your GSC striking-distance queries (positions 4-20), scores each by Impact × Confidence, and writes a specific attack angle for the top 10. Output: a prioritized list of what content to ship next — ranked by what's actually going to move."
        icon={Target}
        accent="emerald"
      />
      <ContentAttackBriefForm clients={allClients} />
    </div>
  );
}
