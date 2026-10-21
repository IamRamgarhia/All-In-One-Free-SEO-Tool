import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import {
  auditRuns,
  cabinetAuditIssues,
  cabinetSites,
} from "@/db/cabinet/schema";
import { AuditIssuesPanel } from "./issues-panel";

export const dynamic = "force-dynamic";

export default async function CabinetAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = requireCabinetDb();

  const [audit] = await db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.id, id))
    .limit(1);
  if (!audit) notFound();

  const [site] = await db
    .select()
    .from(cabinetSites)
    .where(eq(cabinetSites.id, audit.siteId))
    .limit(1);

  const issues = await db
    .select()
    .from(cabinetAuditIssues)
    .where(eq(cabinetAuditIssues.auditRunId, id));

  const categoryScores = (audit.categoryScores ?? {}) as Record<
    string,
    { score: number; pass: number; warn: number; fail: number }
  >;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/cabinet/sites/${audit.siteId}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {site?.url ?? "Site"}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Audit {audit.id.slice(0, 8)}…
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {audit.status} · source {audit.source}
          {audit.finishedAt
            ? ` · terminé ${audit.finishedAt.toLocaleString()}`
            : audit.startedAt
              ? ` · démarré ${audit.startedAt.toLocaleString()}`
              : ""}
        </p>
        {audit.errorMessage ? (
          <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {audit.errorMessage}
          </p>
        ) : null}
      </div>

      <section className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="rounded-2xl border border-white/5 bg-card/40 p-6 text-center">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Score global
          </div>
          <div className="mt-2 text-5xl font-semibold">
            {audit.globalScore ?? "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-card/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Catégories
          </div>
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
              </div>
            ))}
          </div>
        </div>
      </section>

      <AuditIssuesPanel
        siteId={audit.siteId}
        issues={issues.map((i) => ({
          id: i.id,
          ruleId: i.ruleId,
          category: i.category,
          severity: i.severity,
          status: i.status,
          title: i.title,
          description: i.description,
          recommendation: i.recommendation,
          affectedUrls: (i.affectedUrls as string[] | null) ?? [],
        }))}
      />
    </div>
  );
}
