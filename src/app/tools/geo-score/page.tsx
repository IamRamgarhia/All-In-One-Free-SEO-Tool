export const dynamic = "force-dynamic";

import { GeoScoreClient } from "./client";
import { Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";

export default async function GeoScorePage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="GEO composite score"
        description="Weighted scorecard for AI search visibility — citability (25%), brand authority (20%), content E-E-A-T (20%), technical (15%), schema (10%), platform tactics (10%). Forces you to fix the weakest leg first."
        icon={Sparkles}
        accent="violet"
      />
      <GeoScoreClient clients={allClients} />
    </div>
  );
}
