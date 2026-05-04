export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import {
  AlertCircle,
  ExternalLink,
  TrendingDown,
} from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { findContentDecay } from "@/lib/google-data";
import { ClientInfoCard } from "@/components/client-info-card";

export default async function PerClientContentDecayPage({
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

  if (!client.gscProperty) {
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
          basePath="/content-decay/c"
          toolLabel="Content decay"
          icon={TrendingDown}
        />
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="mr-2 inline size-4" />
          Connect Google Search Console first — decay detection compares two
          28-day windows of real per-page click data.
        </div>
      </div>
    );
  }

  const decays = await findContentDecay({
    siteUrl: client.gscProperty,
    minPriorClicks: 30,
    limit: 30,
  });

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
        basePath="/content-decay/c"
        toolLabel="Content decay"
        icon={TrendingDown}
      />

      <PageHeader
        title={`Content decay · ${client.name}`}
        description="Pages that lost clicks vs. the prior 28-day window. Sorted by recovery score (heavier weight on prior traffic — refresh the big losers first)."
        icon={TrendingDown}
        accent="amber"
      />

      <ClientInfoCard
        info={{
          name: client.name,
          url: client.url,
          email: client.email,
          phone: client.phone,
          address: client.address,
          description: client.description,
          city: client.city,
          country: client.country,
          businessType: client.businessType,
          shortDescription: client.description?.split(".")[0] ?? null,
        }}
      />

      {decays.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          No decaying pages found. Either every page is gaining (great problem)
          or there isn&apos;t enough comparable history.
        </div>
      ) : (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">
              Decaying pages ({decays.length})
            </h2>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Page</th>
                <th className="px-3 py-3 text-right font-medium">Recent</th>
                <th className="px-3 py-3 text-right font-medium">Prior</th>
                <th className="px-3 py-3 text-right font-medium">Δ</th>
                <th className="px-3 py-3 text-right font-medium">Pos</th>
                <th className="px-3 py-3 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {decays.map((d) => (
                <tr key={d.page} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-2.5">
                    <a
                      href={d.page}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate font-mono text-xs hover:underline"
                    >
                      {d.page.replace(/^https?:\/\/[^/]+/, "")}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {d.recentClicks}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {d.priorClicks}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-rose-300">
                    {d.deltaPct}%
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {d.recentPosition.toFixed(1)}
                    <span className="text-[10px] text-muted-foreground/60">
                      {" "}
                      ({d.priorPosition.toFixed(1)})
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <RecoveryPill score={d.recoveryScore} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="glass-apple relative overflow-hidden rounded-2xl p-5 text-sm">
        <h2 className="text-base font-semibold">How to use this list</h2>
        <ol className="mt-2 space-y-1.5 text-muted-foreground">
          <li>
            <strong className="text-foreground">1.</strong> Start with the top
            recovery score — that page has both meaningful prior traffic AND
            a meaningful drop.
          </li>
          <li>
            <strong className="text-foreground">2.</strong> Open the page,
            review what&apos;s outdated. Stats? Year mentions? Stale screenshots?
          </li>
          <li>
            <strong className="text-foreground">3.</strong> Run the page
            through{" "}
            <a
              href={`/blog/${clientId}`}
              className="text-violet-300 hover:underline"
            >
              AI blog writer
            </a>{" "}
            with the same target keyword to get a refresh draft.
          </li>
          <li>
            <strong className="text-foreground">4.</strong> Update + publish +
            mark in tasks. Re-check this list in 30 days.
          </li>
        </ol>
      </div>
    </div>
  );
}

function RecoveryPill({ score }: { score: number }) {
  const tone =
    score >= 70
      ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
      : score >= 40
        ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
        : "bg-white/5 text-muted-foreground ring-white/10";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ring-1 ring-inset ${tone}`}
    >
      {score}
    </span>
  );
}
