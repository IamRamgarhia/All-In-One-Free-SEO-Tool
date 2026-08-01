export const dynamic = "force-dynamic";

import { ClipboardList } from "lucide-react";
import { db } from "@/db/client";
import { clients, audits } from "@/db/schema";
import { desc, eq, and, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function AuditsIndexPage() {
  // Hard-cap at 500 clients to keep this page responsive. Realistic max
  // for a freelance/small agency is ~20-50 clients; the cap exists to
  // prevent a pathological case (accidental bulk-import) from blocking
  // the page indefinitely.
  const all = await db
    .select()
    .from(clients)
    .where(await clientScope())
    .orderBy(desc(clients.createdAt))
    .limit(500);

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

      // Compute freshness label inline. Audits older than a week start
      // to drift from reality — we surface that to the user so they
      // know which client cards need a re-run.
      const lastAt = latest?.completedAt ?? latest?.createdAt ?? null;
      let freshness = "";
      if (lastAt) {
        const ageMs = Date.now() - lastAt.getTime();
        const days = Math.floor(ageMs / 86_400_000);
        if (days < 1) freshness = "today";
        else if (days < 7) freshness = `${days}d ago`;
        else if (days < 30) freshness = `${Math.floor(days / 7)}w ago — refresh`;
        else freshness = "stale — refresh";
      }

      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: score !== null ? `${score}/100` : "Not yet audited",
        primaryTone: tone,
        secondary: latest
          ? `${total} audits · ${freshness} · ${latest.issuesCount} issues`
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
        actions={
          <a
            href="/audits/export.csv"
            className="inline-flex h-9 items-center rounded-md border border-white/10 bg-white/5 px-3 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            Export CSV
          </a>
        }
      />
      <ClientToolGrid
        cards={cards}
        basePath="/audits/c"
        emptyHint="Add a client first — audits run per site."
      />
    </div>
  );
}
