export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, asc } from "drizzle-orm";
import { Link2, ExternalLink, FileDown } from "lucide-react";
import { db } from "@/db/client";
import { backlinks, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { AddBacklinkForm } from "@/app/backlinks/add-form";
import { setBacklinkStatus, deleteBacklink } from "@/app/backlinks/actions";

const statusTone: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  lost: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  disavow: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

function DAPill({ da }: { da: number | null }) {
  if (da === null)
    return <span className="text-xs text-muted-foreground">—</span>;
  let tone = "bg-rose-500/10 text-rose-300 ring-rose-500/20";
  if (da >= 70) tone = "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20";
  else if (da >= 40) tone = "bg-amber-500/10 text-amber-300 ring-amber-500/20";
  else if (da >= 20) tone = "bg-cyan-500/10 text-cyan-300 ring-cyan-500/20";
  return (
    <span
      className={`inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-md px-1.5 text-xs font-bold ring-1 ring-inset ${tone}`}
    >
      {da}
    </span>
  );
}

export default async function PerClientBacklinksPage({
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
    .from(backlinks)
    .where(eq(backlinks.clientId, clientId))
    .orderBy(desc(backlinks.firstSeen));

  const summary = {
    active: rows.filter((r) => r.status === "active").length,
    lost: rows.filter((r) => r.status === "lost").length,
    disavow: rows.filter((r) => r.status === "disavow").length,
  };

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
        basePath="/backlinks/c"
        toolLabel="Backlinks"
        icon={Link2}
      />

      <PageHeader
        title={`Backlinks · ${client.name}`}
        description="Track inbound links. Mark lost or disavow, then export a disavow file for Google Search Console."
        icon={Link2}
        accent="emerald"
        actions={
          summary.disavow > 0 ? (
            <Link
              href={`/backlinks/disavow.txt?clientId=${client.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              <FileDown className="size-3.5" />
              Disavow file ({summary.disavow})
            </Link>
          ) : undefined
        }
      />

      <AddBacklinkForm clients={[{ id: client.id, name: client.name }]} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Active" value={summary.active} tone="emerald" />
        <Tile label="Lost" value={summary.lost} tone="amber" />
        <Tile label="Disavowed" value={summary.disavow} tone="rose" />
      </div>

      {rows.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          No backlinks tracked yet. Add some above, or connect Google Search
          Console (Settings → Google) to pull them in automatically.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Source</th>
                <th className="px-3 py-3 text-left font-medium">Anchor</th>
                <th className="px-3 py-3 text-center font-medium">DA</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((b) => {
                const removeAction = deleteBacklink.bind(null, b.id);
                return (
                  <tr
                    key={b.id}
                    className="transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-3">
                      <a
                        href={b.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                      >
                        {b.sourceDomain}
                        <ExternalLink className="size-3 text-muted-foreground" />
                      </a>
                      {b.notes && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {b.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {b.anchorText ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <DAPill da={b.domainAuthority ?? null} />
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusTone[b.status]}`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex gap-1">
                        {(["active", "lost", "disavow"] as const)
                          .filter((s) => s !== b.status)
                          .map((s) => {
                            const action = setBacklinkStatus.bind(null, b.id, s);
                            return (
                              <form key={s} action={action}>
                                <button
                                  type="submit"
                                  className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                                >
                                  → {s}
                                </button>
                              </form>
                            );
                          })}
                        <form action={removeAction}>
                          <button
                            type="submit"
                            className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                          >
                            remove
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose";
}) {
  const cls = {
    emerald: "text-gradient-emerald",
    amber: "text-gradient-amber",
    rose: "text-gradient-rose",
  }[tone];
  return (
    <div className="glass-apple relative overflow-hidden rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
    </div>
  );
}
