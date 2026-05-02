export const dynamic = "force-dynamic";

import { FileText } from "lucide-react";
import { db } from "@/db/client";
import {
  clients,
  audits,
  reportSchedules,
} from "@/db/schema";
import { desc, eq, and, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function ReportsIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [latest] = await db
        .select()
        .from(audits)
        .where(
          and(eq(audits.clientId, c.id), eq(audits.status, "completed")),
        )
        .orderBy(desc(audits.completedAt))
        .limit(1);

      const [{ value: scheduled }] = await db
        .select({ value: count() })
        .from(reportSchedules)
        .where(
          and(
            eq(reportSchedules.clientId, c.id),
            eq(reportSchedules.enabled, true),
          ),
        );

      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: latest
          ? `Score ${latest.score ?? "—"}/100`
          : "No data yet",
        primaryTone: latest
          ? latest.score === null
            ? "neutral"
            : latest.score >= 80
              ? "emerald"
              : latest.score >= 50
                ? "amber"
                : "rose"
          : "neutral",
        secondary: latest
          ? `Last audit ${(latest.completedAt ?? latest.createdAt).toLocaleDateString()}`
          : "Run an audit to populate the report",
        badges:
          scheduled > 0
            ? [
                {
                  label: `${scheduled} schedule${scheduled === 1 ? "" : "s"}`,
                  tone: "emerald" as const,
                },
              ]
            : undefined,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Reports"
        description="Pick a client to download their branded SEO report as PDF, view a live preview, or grab the raw data as CSV."
        icon={FileText}
        accent="cyan"
      />
      <ClientToolGrid cards={cards} basePath="/reports/c" />
    </div>
  );
}
