export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ClipboardList } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { openToolFindings } from "@/lib/tool-findings";
import { FindingsBoard } from "./board";

/**
 * Everything the tools found about one client, in one place.
 *
 * Twenty-nine tools record findings. Until this page there was nowhere
 * to read them: they reached the ranked list as a single summary row,
 * the agent for the handful of signatures it can act on, and the monthly
 * report — but nobody could sit down and work through them.
 *
 * Worse, `markFindingStatus` was reachable from exactly one tool's
 * results page. So the rule that a status a person sets survives the
 * next run — the thing that stops the agent re-planning work its owner
 * declined — was nearly impossible to exercise, because there was almost
 * nowhere to set one.
 */
export default async function ClientFindingsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: raw } = await params;
  const clientId = Number.parseInt(raw, 10);
  if (!Number.isInteger(clientId)) notFound();

  const [client] = await db
    .select({ id: clients.id, name: clients.name, url: clients.url })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const findings = await openToolFindings(clientId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="What the tools found"
        description={`Open findings for ${client.name}, from the checks that run on their own and the ones you ran by hand. Resolving or ignoring one here sticks — the next run will not raise it again.`}
        icon={ClipboardList}
        accent="cyan"
      />

      {/*
        Always the board, including when the list is empty — it owns the
        empty state too. Swapping it out for a message here would unmount
        it the moment the last finding was dealt with, taking the undo
        button with it.
      */}
      <FindingsBoard
        // Remounts when the client changes. The board snapshots its list
        // on mount, so without this a client-side navigation from one
        // client's findings to another's would keep showing the first
        // client's rows under the second client's name.
        key={clientId}
        clientId={clientId}
        clientName={client.name}
        findings={findings}
      />

      <p className="text-xs text-muted-foreground">
        <Link
          href={`/clients/${clientId}`}
          className="text-primary hover:underline"
        >
          Back to {client.name}
        </Link>
      </p>
    </div>
  );
}
