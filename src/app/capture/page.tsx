export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { Magnet } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { CaptureClient } from "./capture-client";

export default async function CapturePage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Universal capture"
        description="Paste any URL and we extract everything — title, meta, brand, logo, NAP, social links, schema. One field replaces five Google Sheets columns."
        icon={Magnet}
        accent="cyan"
      />

      <CaptureClient clients={allClients} />
    </div>
  );
}
