export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { Bookmark } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { listAllAnnotations } from "@/lib/annotations-store";
import { clientScope } from "@/lib/client-scope";
import { AnnotationsClient } from "./client";

export default async function AnnotationsPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const annotations = await listAllAnnotations({ limit: 300 });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Chart annotations"
        description="Manual markers that overlay on rank, traffic, and CWV charts. Use them to correlate ranking changes with algorithm updates, content launches, migrations, or outreach milestones."
        icon={Bookmark}
        accent="amber"
      />
      <AnnotationsClient clients={allClients} annotations={annotations} />
    </div>
  );
}
