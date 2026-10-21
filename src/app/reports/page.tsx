export const dynamic = "force-dynamic";

import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import {
  clients,
  audits,
  reportSchedules,
} from "@/db/schema";
import { desc, eq, and, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function ReportsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; embed?: string }>;
}) {
  const t = await getTranslations("reports");

  // Opened from a client, so the client is already chosen.
  //
  // The "Tools for this client" rail links here with ?clientId=, and
  // this page ignored it and drew the picker anyway — so picking a
  // client and then picking a tool asked you to pick the client again.
  // The per-client page it would have sent you to already exists.
  const { clientId, embed } = await searchParams;
  if (clientId && /^\d+$/.test(clientId)) {
    // Carry ?embed=1 through. Without it the drawer would load the
    // full shell inside itself — a sidebar inside a sidebar.
    redirect(`/reports/c/${clientId}${embed ? "?embed=1" : ""}`);
  }

  const all = await db.select().from(clients).where(await clientScope()).orderBy(desc(clients.createdAt));

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
          ? t("scoreOutOf", { score: latest.score ?? "—" })
          : t("noDataYet"),
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
          ? t("lastAudit", {
              date: (latest.completedAt ?? latest.createdAt).toLocaleDateString(),
            })
          : t("runAuditToPopulate"),
        badges:
          scheduled > 0
            ? [
                {
                  label: t("schedules", { count: scheduled }),
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
        title={t("title")}
        description={t("description")}
        icon={FileText}
        accent="cyan"
        actions={
          <a
            href="/reports/export.csv"
            className="inline-flex h-9 items-center rounded-md border border-white/10 bg-white/5 px-3 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            {t("exportAllCsv")}
          </a>
        }
      />
      <ClientToolGrid cards={cards} basePath="/reports/c" />
    </div>
  );
}
