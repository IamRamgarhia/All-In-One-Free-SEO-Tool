export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { desc, eq, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { Button } from "@/components/ui/button";
import { runAuditForClient } from "@/app/audits/actions";

const statusTone: Record<string, string> = {
  queued: "bg-white/5 text-muted-foreground ring-white/10",
  running: "bg-violet-500/15 text-violet-300 ring-violet-500/20",
  completed: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
  failed: "bg-rose-500/15 text-rose-300 ring-rose-500/20",
};

function ScoreBadge({ score }: { score: number | null }) {
  let tone = "bg-muted/40 text-muted-foreground ring-border";
  let textTone = "";
  if (score !== null) {
    if (score >= 80) {
      tone = "bg-emerald-500/10 ring-emerald-500/30";
      textTone = "text-gradient-emerald";
    } else if (score >= 50) {
      tone = "bg-amber-500/10 ring-amber-500/30";
      textTone = "text-gradient-amber";
    } else {
      tone = "bg-rose-500/10 ring-rose-500/30";
      textTone = "text-gradient-rose";
    }
  }
  return (
    <span
      className={`inline-flex h-9 w-12 items-center justify-center rounded-lg text-sm font-bold ring-1 ring-inset ${tone} ${textTone}`}
    >
      {score ?? "—"}
    </span>
  );
}

export default async function PerClientAuditsPage({
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
    .orderBy(asc(clients.name));

  const rows = await db
    .select()
    .from(audits)
    .where(eq(audits.clientId, clientId))
    .orderBy(desc(audits.createdAt));

  const runAction = runAuditForClient.bind(null, clientId);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/audits/c"
        toolLabel="Audits"
        icon={ClipboardList}
      />

      <PageHeader
        title={`Audits · ${client.name}`}
        description="Every audit run for this client. Click an audit to see issues, severity grouping, and the tasks generated from it."
        icon={ClipboardList}
        accent="cyan"
        actions={
          <form action={runAction}>
            <Button type="submit">Run new audit</Button>
          </form>
        }
      />

      {rows.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No audits yet for this client. Click &ldquo;Run new audit&rdquo; to
            do the first one.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Audit</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-left font-medium">Issues</th>
                <th className="px-5 py-3 text-left font-medium">When</th>
                <th className="px-5 py-3 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((a, idx) => {
                const previousCompleted = rows
                  .slice(idx + 1)
                  .find((r) => r.status === "completed");
                return (
                  <tr key={a.id} className="group transition-colors hover:bg-white/[0.03]">
                    <td className="px-5 py-4">
                      <Link
                        href={`/audits/${a.id}`}
                        className="font-medium group-hover:underline"
                      >
                        Audit #{a.id}
                      </Link>
                      {previousCompleted && (
                        <Link
                          href={`/audits/diff?a=${previousCompleted.id}&b=${a.id}`}
                          className="ml-2 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-foreground"
                        >
                          diff vs #{previousCompleted.id}
                        </Link>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusTone[a.status] ?? statusTone.queued}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {a.issuesCount}
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {(a.completedAt ?? a.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <ScoreBadge score={a.score ?? null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
