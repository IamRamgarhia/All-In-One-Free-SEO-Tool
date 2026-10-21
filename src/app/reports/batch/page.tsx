export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { FileStack } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { currentUser, visibleClientIds } from "@/lib/auth";
import { latestBatch, reviewQueue } from "@/lib/report-batch";
import { BatchRunner } from "./runner";

export default async function ReportBatchPage() {
  const t = await getTranslations("reports");
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
        title={t("batchTitle")}
        description={t("batchDescription")}
        icon={FileStack}
        accent="cyan"
        crumbs={[
          { href: "/reports", label: t("crumbReports") },
          { label: t("crumbGenerateAll") },
        ]}
      />
      <BatchRunner
        clients={all}
        queue={queue}
        initialBatch={running && running.status === "running" ? running : null}
      />
    </div>
  );
}
