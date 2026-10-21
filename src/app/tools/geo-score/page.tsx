export const dynamic = "force-dynamic";

import { Sparkles } from "lucide-react";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { ToolPageChrome } from "@/components/tools/tool-page-chrome";
import { clientScope } from "@/lib/client-scope";
import { GeoScoreClient } from "./client";

export default async function GeoScorePage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <ToolPageChrome
      toolHref="/tools/geo-score"
      icon={Sparkles}
      accentBg="bg-violet-500/15"
      accentRing="ring-violet-400/30"
      iconClassName="text-violet-300"
    >
      <GeoScoreClient clients={allClients} />
    </ToolPageChrome>
  );
}
