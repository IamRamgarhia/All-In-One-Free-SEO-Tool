export const dynamic = "force-dynamic";

import Link from "next/link";
import { History } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, toolRuns } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { TOOL_LABELS } from "@/lib/tool-runs";
import { clientScope } from "@/lib/client-scope";
import { HistoryClient } from "./client";

type SearchParams = {
  tool?: string;
  client?: string;
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filterTool = sp.tool ?? "";
  const filterClient = sp.client ? Number(sp.client) : null;

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);

  let q = db.select().from(toolRuns).$dynamic();
  if (filterTool) q = q.where(eq(toolRuns.toolId, filterTool));
  if (filterClient !== null)
    q = q.where(eq(toolRuns.clientId, filterClient));

  const runs = await q
    .orderBy(desc(toolRuns.pinned), desc(toolRuns.createdAt))
    .limit(200);

  // Tool counts for the filter chips
  const allRunsForCounts = await db
    .select({ toolId: toolRuns.toolId })
    .from(toolRuns);
  const toolCounts = new Map<string, number>();
  for (const r of allRunsForCounts) {
    toolCounts.set(r.toolId, (toolCounts.get(r.toolId) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Run history"
        description="Every saved run from every tool. Pin the ones you want to keep around. Click a run to see its full output (where the tool supports restore). Bulk-clear unpinned via the page-level button."
        icon={History}
        accent="violet"
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {runs.length} of {allRunsForCounts.length} total runs
            </span>
            {filterTool && (
              <Link
                href="/history"
                className="rounded-full bg-white/5 px-2 py-0.5 ring-1 ring-inset ring-white/10 hover:bg-white/10"
              >
                Clear filter
              </Link>
            )}
          </div>
        }
      />

      <HistoryClient
        runs={runs}
        clients={allClients}
        toolCounts={Array.from(toolCounts.entries()).sort(
          (a, b) => b[1] - a[1],
        )}
        toolLabels={TOOL_LABELS}
        currentTool={filterTool}
        currentClient={filterClient}
      />
    </div>
  );
}
