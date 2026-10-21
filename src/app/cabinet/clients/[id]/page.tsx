import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import {
  auditRuns,
  cabinetClients,
  cabinetSites,
} from "@/db/cabinet/schema";
import { CreateSiteForm } from "./create-site-form";

export const dynamic = "force-dynamic";

export default async function CabinetClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = requireCabinetDb();

  const [client] = await db
    .select()
    .from(cabinetClients)
    .where(eq(cabinetClients.id, id))
    .limit(1);
  if (!client) notFound();

  const sites = await db
    .select()
    .from(cabinetSites)
    .where(eq(cabinetSites.clientId, id));

  const sitesWithScore = await Promise.all(
    sites.map(async (site) => {
      const [latest] = await db
        .select()
        .from(auditRuns)
        .where(eq(auditRuns.siteId, site.id))
        .orderBy(desc(auditRuns.createdAt))
        .limit(1);
      return { site, latest };
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/cabinet"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Clients
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {client.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {client.sector ?? "Sans secteur"}
          {client.notes ? ` · ${client.notes}` : ""}
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-lg font-medium">Sites</h2>
          <CreateSiteForm clientId={client.id} />
        </div>

        {sitesWithScore.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun site. Ajoutez l&apos;URL à auditer.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sitesWithScore.map(({ site, latest }) => (
              <Link
                key={site.id}
                href={`/cabinet/sites/${site.id}`}
                className="rounded-2xl border border-white/5 bg-card/40 p-5 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {site.name ?? site.url}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {site.url}
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {site.environment}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold">
                      {latest?.globalScore ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {latest?.status ?? "pas d’audit"}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
