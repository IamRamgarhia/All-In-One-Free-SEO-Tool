import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import {
  auditRuns,
  cabinetAuditIssues,
  cabinetClients,
  cabinetSites,
} from "@/db/cabinet/schema";
import { CreateClientForm } from "./create-client-form";

export const dynamic = "force-dynamic";

export default async function CabinetClientsPage() {
  let clients: {
    id: string;
    name: string;
    sector: string | null;
    createdAt: Date;
    siteCount: number;
    latestScore: number | null;
    criticalCount: number;
  }[] = [];
  let error: string | null = null;

  try {
    const db = requireCabinetDb();
    const rows = await db
      .select()
      .from(cabinetClients)
      .orderBy(desc(cabinetClients.createdAt));

    clients = await Promise.all(
      rows.map(async (c) => {
        const sites = await db
          .select()
          .from(cabinetSites)
          .where(eq(cabinetSites.clientId, c.id));

        let latestScore: number | null = null;
        let criticalCount = 0;

        for (const site of sites) {
          const [latest] = await db
            .select()
            .from(auditRuns)
            .where(eq(auditRuns.siteId, site.id))
            .orderBy(desc(auditRuns.finishedAt))
            .limit(1);
          if (latest?.status === "completed" && latest.globalScore != null) {
            if (latestScore === null || latest.globalScore < latestScore) {
              latestScore = latest.globalScore;
            }
            const crit = await db
              .select({ n: sql<number>`count(*)::int` })
              .from(cabinetAuditIssues)
              .where(
                sql`${cabinetAuditIssues.auditRunId} = ${latest.id} AND ${cabinetAuditIssues.severity} = 'critical'`,
              );
            criticalCount += Number(crit[0]?.n ?? 0);
          }
        }

        return {
          id: c.id,
          name: c.name,
          sector: c.sector,
          createdAt: c.createdAt,
          siteCount: sites.length,
          latestScore,
          criticalCount,
        };
      }),
    );
  } catch (err) {
    error = err instanceof Error ? err.message : "Cabinet unavailable";
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Portefeuille cabinet — sites, scores SEOmator, problèmes critiques.
          </p>
        </div>
        <CreateClientForm />
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center text-sm text-muted-foreground">
          Aucun client. Créez-en un pour rattacher des sites et lancer des
          audits SEOmator.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Client</th>
                <th className="px-5 py-3 text-left font-medium">Secteur</th>
                <th className="px-5 py-3 text-left font-medium">Sites</th>
                <th className="px-5 py-3 text-left font-medium">Score</th>
                <th className="px-5 py-3 text-left font-medium">Critiques</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/cabinet/clients/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {c.sector ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {c.siteCount}
                  </td>
                  <td className="px-5 py-4">
                    {c.latestScore != null ? (
                      <span className="font-semibold">{c.latestScore}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {c.criticalCount > 0 ? (
                      <span className="text-rose-300">{c.criticalCount}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
