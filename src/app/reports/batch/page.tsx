export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { FileStack } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { currentUser, visibleClientIds } from "@/lib/auth";
import { latestBatch, reviewQueue } from "@/lib/report-batch";
import { BatchRunner } from "./runner";

export default async function ReportBatchPage() {
  const all = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const scope = await visibleClientIds(await currentUser());
  const [queue, running] = await Promise.all([
    reviewQueue(scope),
    latestBatch(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Generate all reports"
        description="Build every client's report in one run, read them, then send. Nothing goes out until you say so."
        icon={FileStack}
        accent="cyan"
        crumbs={[{ href: "/reports", label: "Reports" }, { label: "Generate all" }]}
      />
      <BatchRunner
        clients={all}
        queue={queue}
        initialBatch={running && running.status === "running" ? running : null}
      />
    </div>
  );
}
