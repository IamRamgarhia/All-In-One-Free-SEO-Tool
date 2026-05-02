export const dynamic = "force-dynamic";

import { ClipboardList } from "lucide-react";
import { db } from "@/db/client";
import { clients, audits } from "@/db/schema";
import { desc, eq, and, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function AuditsIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(audits)
        .where(eq(audits.clientId, c.id));

      const [latest] = await db
        .select()
        .from(audits)
        .where(
          and(eq(audits.clientId, c.id), eq(audits.status, "completed")),
        )
        .orderBy(desc(audits.completedAt))
        .limit(1);

      const score = latest?.score ?? null;
      const tone =
        score === null
          ? "neutral"
          : score >= 80
            ? "emerald"
            : score >= 50
              ? "amber"
              : "rose";

      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: score !== null ? `${score}/100` : "Not yet audited",
        primaryTone: tone,
        secondary: latest
          ? `${total} audits · last ${(latest.completedAt ?? latest.createdAt).toLocaleDateString()} · ${latest.issuesCount} issues`
          : `${total} audits run`,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Audits"
        description="Pick a client to see every audit you've run, severity grouping, fix wizards, and trending score over time."
        icon={ClipboardList}
        accent="cyan"
      />
      <ClientToolGrid
        cards={cards}
        basePath="/audits/c"
        emptyHint="Add a client first — audits run per site."
      />
    </div>
  );
}
