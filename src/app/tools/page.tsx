import { Suspense } from "react";
import { MostUsedTools } from "./most-used";
import { ToolsGrid } from "./tools-grid";
import { getConnectionMode } from "../settings/connection-mode-actions";

export const dynamic = "force-dynamic";

/**
 * Server shell around the (client) tool grid.
 *
 * The grid needs client state for search and pinning; the usage rails
 * need the database. Splitting them here lets each be what it needs to
 * be, and keeps the rails out of the grid's hydration payload.
 */
export default async function ToolsHubPage() {
  // Read here rather than in the grid: the grid is a client component, and
  // this decides which badge every card shows, so it has to be known on the
  // server or the badges would pop in after hydration.
  const mode = await getConnectionMode();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Streamed: the grid is the point of the page and shouldn't wait
          on a usage query to paint. */}
      <Suspense fallback={null}>
        <MostUsedTools />
      </Suspense>
      <ToolsGrid mode={mode} />
    </div>
  );
}
