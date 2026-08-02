export const dynamic = "force-dynamic";

import { and, desc, inArray, isNull, or } from "drizzle-orm";
import { Bot } from "lucide-react";
import { db } from "@/db/client";
import { agentActions, agentRuns, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { getAgentSettings } from "@/lib/agent/autonomy";
import { clientScope } from "@/lib/client-scope";
import { AutopilotPanel } from "./panel";

export default async function AutopilotPage() {
  const settings = await getAgentSettings();

  const visibleClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);
  const visibleIds = visibleClients.map((c) => c.id);

  // Filter by client IN THE QUERY, not after.
  //
  // Doing the limit first and the scoping second looks equivalent and
  // isn't: a member assigned to one of eighteen clients would get the 50
  // most recent rows agency-wide, then have almost all of them filtered
  // out, and see an empty queue while genuinely having items waiting.
  // Not an access leak — the filter still ran — but a silently wrong
  // answer, which is the failure mode this codebase keeps producing.
  const scoped = (statuses: ("queued" | "proposed" | "applied" | "verified" | "failed" | "reverted")[]) =>
    db
      .select()
      .from(agentActions)
      .where(
        and(
          inArray(agentActions.status, statuses),
          inArray(agentActions.clientId, visibleIds),
        ),
      )
      .orderBy(desc(agentActions.createdAt))
      .limit(50);

  const pending = visibleIds.length ? await scoped(["queued", "proposed"]) : [];
  const recent = visibleIds.length
    ? await scoped(["applied", "verified", "failed", "reverted"])
    : [];

  const runs = visibleIds.length
    ? await db
        .select()
        .from(agentRuns)
        .where(
          or(
            inArray(agentRuns.clientId, visibleIds),
            // Runs not tied to a client (a whole-workspace sweep) are
            // everyone's business.
            isNull(agentRuns.clientId),
          ),
        )
        .orderBy(desc(agentRuns.startedAt))
        .limit(10)
    : [];

  const nameOf = new Map(visibleClients.map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Autopilot"
        description="What the agent does on its own, what it's waiting to ask you about, and everything it has changed."
        icon={Bot}
        accent="violet"
        crumbs={[{ href: "/agent", label: "Agent" }, { label: "Autopilot" }]}
      />
      <AutopilotPanel
        settings={settings}
        clients={visibleClients}
        pending={pending.map(serialise).map((a) => ({
          ...a,
          clientName: nameOf.get(a.clientId) ?? "",
        }))}
        recent={recent.map(serialise).map((a) => ({
          ...a,
          clientName: nameOf.get(a.clientId) ?? "",
        }))}
        runs={runs
          .map((r) => ({
            id: r.id,
            clientName: r.clientId ? (nameOf.get(r.clientId) ?? "") : "All clients",
            mode: r.mode,
            trigger: r.trigger,
            startedAt: r.startedAt.toISOString(),
            applied: r.applied,
            queued: r.queued,
            failed: r.failed,
            summary: r.summary,
            error: r.error,
          }))}
      />
    </div>
  );
}

/** Dates don't survive the server/client boundary; strings do. */
function serialise(a: typeof agentActions.$inferSelect) {
  return {
    id: a.id,
    clientId: a.clientId,
    kind: a.kind,
    targetUrl: a.targetUrl,
    beforeValue: a.beforeValue,
    afterValue: a.afterValue,
    reason: a.reason,
    risk: a.risk,
    status: a.status,
    error: a.error,
    verifyNote: a.verifyNote,
    createdAt: a.createdAt.toISOString(),
  };
}

export type SerialisedAction = ReturnType<typeof serialise> & {
  clientName: string;
};
