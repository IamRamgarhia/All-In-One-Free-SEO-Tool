import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import {
  auditDiffs,
  auditRuns,
  cabinetClients,
  cabinetSites,
} from "@/db/cabinet/schema";
import { LaunchAuditButton } from "./launch-audit-button";

export const dynamic = "force-dynamic";

export default async function CabinetSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = requireCabinetDb();

  const [site] = await db
    .select()
    .from(cabinetSites)
    .where(eq(cabinetSites.id, id))
    .limit(1);
  if (!site) notFound();

  const [client] = await db
    .select()
    .from(cabinetClients)
    .where(eq(cabinetClients.id, site.clientId))
    .limit(1);

  const audits = await db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.siteId, id))
    .orderBy(desc(auditRuns.createdAt))
    .limit(20);

  const completed = audits.filter((a) => a.status === "completed");
  const latest = completed[0] ?? null;
  const previous = completed[1] ?? null;

  const [latestDiff] = await db
    .select()
    .from(auditDiffs)
    .where(eq(auditDiffs.siteId, id))
    .orderBy(desc(auditDiffs.createdAt))
    .limit(1);

  const categoryScores = (latest?.categoryScores ?? {}) as Record<
    string,
    { score: number; pass: number; warn: number; fail: number }
  >;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/cabinet/clients/${site.clientId}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← {client?.name ?? "Client"}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {site.name ?? site.url}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {site.url} · {site.environment}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LaunchAuditButton siteId={site.id} />
          {latest && previous ? (
            <Link
              href={`/api/audits/compare?previous=${previous.id}&current=${latest.id}`}
              className="rounded-lg bg-white/5 px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/10"
            >
              Comparer avec précédent
            </Link>
          ) : null}
          <Link
            href={`/cabinet/sites/${site.id}/actions`}
            className="rounded-lg bg-white/5 px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/10"
          >
            Plan d&apos;action
          </Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="rounded-2xl border border-white/5 bg-card/40 p-6 text-center">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Score global
          </div>
          <div className="mt-2 text-5xl font-semibold">
            {latest?.globalScore ?? "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {latest
              ? `${latest.pagesCrawled ?? "?"} pages · ${latest.source}`
              : "Lancez un audit SEOmator"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-card/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Scores par catégorie
          </div>
          {Object.keys(categoryScores).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Pas encore de données.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(categoryScores).map(([cat, val]) => (
                <div
                  key={cat}
                  className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/5"
                >
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {cat}
                  </div>
                  <div className="text-lg font-semibold">{val.score}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {val.fail}f / {val.warn}w
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {latestDiff ? (
        <section className="rounded-2xl border border-white/5 bg-card/40 p-5 text-sm">
          <h2 className="font-medium">Dernier diff</h2>
          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            <span className="text-emerald-300">
              {(latestDiff.fixedRules as string[] | null)?.length ?? 0} corrigés
            </span>
            <span className="text-rose-300">
              {(latestDiff.regressedRules as string[] | null)?.length ?? 0}{" "}
              régressions
            </span>
            <span className="text-amber-300">
              {(latestDiff.newIssues as string[] | null)?.length ?? 0} nouveaux
            </span>
            <span className="text-muted-foreground">
              Δ score {latestDiff.scoreDelta ?? "—"}
            </span>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-medium">Historique des audits</h2>
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left">Audit</th>
                <th className="px-5 py-3 text-left">Statut</th>
                <th className="px-5 py-3 text-left">Score</th>
                <th className="px-5 py-3 text-left">Quand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {audits.map((a) => (
                <tr key={a.id} className="hover:bg-white/[0.03]">
                  <td className="px-5 py-3">
                    <Link
                      href={`/cabinet/audits/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {a.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{a.status}</td>
                  <td className="px-5 py-3">{a.globalScore ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {(a.finishedAt ?? a.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
