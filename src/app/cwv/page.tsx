export const dynamic = "force-dynamic";

import { Gauge } from "lucide-react";
import { db } from "@/db/client";
import { clients, cwvReports } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function CwvIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(cwvReports)
        .where(eq(cwvReports.clientId, c.id));
      const [latest] = await db
        .select()
        .from(cwvReports)
        .where(eq(cwvReports.clientId, c.id))
        .orderBy(desc(cwvReports.scannedAt))
        .limit(1);

      const score = latest?.performance ?? null;
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary:
          score !== null ? `${score}/100` : total === 0 ? "Not scanned" : "—",
        primaryTone:
          score === null
            ? "neutral"
            : score >= 90
              ? "emerald"
              : score >= 50
                ? "amber"
                : "rose",
        secondary:
          total === 0
            ? "Click to run the first scan"
            : `${total} report${total === 1 ? "" : "s"} · last ${latest?.scannedAt.toLocaleDateString() ?? "—"}`,
        badges:
          latest?.overall === "pass"
            ? [{ label: "CWV pass", tone: "emerald" as const }]
            : latest?.overall === "fail"
              ? [{ label: "CWV fail", tone: "amber" as const }]
              : undefined,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Core Web Vitals"
        description="Pick a client to run free PageSpeed Insights scans on any URL — Lighthouse scores + LCP/INP/CLS verdicts + ranked optimization opportunities."
        icon={Gauge}
        accent="cyan"
      />
      <ClientToolGrid cards={cards} basePath="/cwv/c" />
    </div>
  );
}
