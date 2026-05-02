export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { desc, eq, asc, inArray } from "drizzle-orm";
import { Activity, ExternalLink, X } from "lucide-react";
import { db } from "@/db/client";
import { clients, monitoredPages, pageChanges } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { AddMonitorForm } from "@/app/monitor/add-form";
import {
  CheckAllPagesButton,
  CheckPageButton,
} from "@/app/monitor/monitor-buttons";
import { deleteMonitoredPage, setMonitorStatus } from "@/app/monitor/actions";

const fieldTone: Record<string, string> = {
  title: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  description: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  h1: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  canonical: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  content: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export default async function PerClientMonitorPage({
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

  const pages = await db
    .select()
    .from(monitoredPages)
    .where(eq(monitoredPages.clientId, clientId))
    .orderBy(desc(monitoredPages.updatedAt));

  const recentChanges =
    pages.length === 0
      ? []
      : await db
          .select()
          .from(pageChanges)
          .where(
            inArray(
              pageChanges.monitoredPageId,
              pages.map((p) => p.id),
            ),
          )
          .orderBy(desc(pageChanges.detectedAt))
          .limit(20);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/monitor/c"
        toolLabel="Page monitor"
        icon={Activity}
      />

      <PageHeader
        title={`Page monitor · ${client.name}`}
        description="Track meta title / description / H1 / canonical changes on key pages."
        icon={Activity}
        accent="violet"
        actions={pages.length > 0 ? <CheckAllPagesButton /> : undefined}
      />

      <AddMonitorForm clients={[{ id: client.id, name: client.name }]} />

      {pages.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          No pages monitored yet. Add a few above to start tracking changes.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <ul className="divide-y divide-white/5">
            {pages.map((p) => {
              const removeAction = deleteMonitoredPage.bind(null, p.id);
              const toggleAction = setMonitorStatus.bind(
                null,
                p.id,
                p.status === "active" ? "paused" : "active",
              );
              return (
                <li
                  key={p.id}
                  className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.label && (
                        <span className="font-medium">{p.label}</span>
                      )}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {p.url.replace(/^https?:\/\//, "")}
                        <ExternalLink className="size-3" />
                      </a>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                          p.status === "active"
                            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                            : "bg-white/5 text-muted-foreground ring-white/10"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    {p.lastTitle && (
                      <div className="truncate text-xs text-muted-foreground">
                        Title: {p.lastTitle}
                      </div>
                    )}
                    {p.lastCheckedAt && (
                      <div className="text-[11px] text-muted-foreground/70">
                        Last checked {p.lastCheckedAt.toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckPageButton pageId={p.id} />
                    <form action={toggleAction}>
                      <button
                        type="submit"
                        className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                      >
                        {p.status === "active" ? "pause" : "resume"}
                      </button>
                    </form>
                    <form action={removeAction}>
                      <button
                        type="submit"
                        aria-label="Remove"
                        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <X className="size-3.5" />
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {recentChanges.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <header className="border-b border-white/5 px-5 py-4">
            <h2 className="text-base font-semibold">Recent changes</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last 20 detected diffs across this client&apos;s pages.
            </p>
          </header>
          <ul className="divide-y divide-white/5">
            {recentChanges.map((c) => (
              <li key={c.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${fieldTone[c.field] ?? fieldTone.title}`}
                  >
                    {c.field}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {c.detectedAt.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 grid gap-1 text-xs">
                  {c.oldValue && (
                    <div className="text-muted-foreground line-through">
                      {c.oldValue}
                    </div>
                  )}
                  {c.newValue && (
                    <div className="text-foreground/90">{c.newValue}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
