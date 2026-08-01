export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { eq, asc, desc } from "drizzle-orm";
import { Map } from "lucide-react";
import { db } from "@/db/client";
import { clients, localGridChecks } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { clientScope } from "@/lib/client-scope";
import { GridForm } from "./grid-form";
import { GridHistory } from "./grid-history";
import { ScheduleList } from "./schedule-list";
import { listGridSchedules } from "../../actions";
import { ScheduleForm } from "./schedule-form";

export default async function PerClientLocalGridPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const [recentGrids, schedules] = await Promise.all([
    db
      .select()
      .from(localGridChecks)
      .where(eq(localGridChecks.clientId, clientId))
      .orderBy(desc(localGridChecks.ranAt))
      .limit(10),
    listGridSchedules(clientId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/local-grid/c"
        toolLabel="Local heatmap"
        icon={Map}
      />

      <PageHeader
        title={`Local-pack heatmap · ${client.name}`}
        description="Pick a query and a centre point. The tool samples ranking from a grid of locations and shows where you appear in the 3-pack."
        icon={Map}
        accent="emerald"
      />

      <GridForm clientId={client.id} />

      <ScheduleForm clientId={client.id} />

      <ScheduleList
        schedules={schedules.map((s) => ({
          id: s.id,
          query: s.query,
          cadence: s.cadence,
          enabled: s.enabled,
          lastRanAt: s.lastRanAt,
          centerLat: s.centerLat,
          centerLng: s.centerLng,
          gridSize: s.gridSize,
          spacingM: s.spacingM,
        }))}
      />

      {recentGrids.length > 0 && (
        <GridHistory
          grids={recentGrids.map((g) => ({
            id: g.id,
            query: g.query,
            ranAt: g.ranAt,
            gridSize: g.gridSize,
            spacingM: g.spacingM,
            cells: g.cells ?? [],
            avgPosition: g.avgPosition,
            inPackPct: g.inPackPct,
          }))}
        />
      )}
    </div>
  );
}
