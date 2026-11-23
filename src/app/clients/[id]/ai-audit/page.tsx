export const dynamic = "force-dynamic";

import { getTranslations, getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, Bot, ExternalLink } from "lucide-react";
import { db } from "@/db/client";
import { audits, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { RunForm } from "./run-form";

export default async function ClientAiAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tx = await getTranslations("ui.app_clients_id_ai-audit_page");
  const locale = await getLocale();
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const past = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.kind, "ai_full")))
    .orderBy(desc(audits.createdAt))
    .limit(20);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/clients/${clientId}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        {tx("backToClient")}
      </Link>
      <PageHeader
        title={tx("aiAudit", { name: client.name })}
        description={tx("aiVisitsThePageRuns")}
        icon={Bot}
        accent="violet"
      />

      <RunForm clientId={clientId} defaultUrl={client.url} />

      {past.length === 0 ? (
        <p className="rounded-md bg-white/[0.02] px-3 py-2 text-sm text-muted-foreground">
          {tx("noAuditsRunYetKick")}
        </p>
      ) : (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-3">
            <h3 className="text-sm font-semibold">{tx("auditHistory", { length: past.length })}</h3>
          </header>
          <ul className="divide-y divide-white/[0.05]">
            {past.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-5 py-3 text-xs"
              >
                <Link
                  href={`/clients/${clientId}/ai-audit/${a.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 hover:text-violet-300"
                >
                  <span
                    className={`inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold ring-1 ring-inset ${
                      a.score === null
                        ? "bg-white/5 text-muted-foreground ring-white/10"
                        : a.score >= 80
                          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                          : a.score >= 50
                            ? "bg-amber-500/10 text-amber-300 ring-amber-500/30"
                            : "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                    }`}
                  >
                    {a.score ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {a.targetUrl?.replace(/^https?:\/\//, "") ?? tx("noUrl")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {tx.rich("issuesOpen", { v: a.createdAt.toLocaleString(locale), issuesCount: a.issuesCount, status: a.status, b0: (chunks) => <span
                        className={
                          a.status === "completed"
                            ? "text-emerald-300"
                            : a.status === "running"
                              ? "text-amber-300"
                              : "text-rose-300"
                        }
                      >{chunks}</span> })}
                    </div>
                  </div>
                </Link>
                {a.targetUrl && (
                  <a
                    href={a.targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
