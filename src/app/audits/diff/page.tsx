import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  ArrowRightLeft,
  CheckCircle2,
  Plus,
  Minus,
} from "lucide-react";
import { db } from "@/db/client";
import { audits, auditIssues, clients } from "@/db/schema";
import { ScoreGauge } from "@/components/ui/score-gauge";

type IssueRow = typeof auditIssues.$inferSelect;

function keyOf(issue: IssueRow): string {
  return `${issue.type}::${issue.url}`;
}

export default async function AuditDiffPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const sp = await searchParams;
  const aId = Number(sp.a);
  const bId = Number(sp.b);
  if (!Number.isFinite(aId) || !Number.isFinite(bId)) notFound();

  const [auditA] = await db
    .select()
    .from(audits)
    .where(eq(audits.id, aId))
    .limit(1);
  const [auditB] = await db
    .select()
    .from(audits)
    .where(eq(audits.id, bId))
    .limit(1);
  if (!auditA || !auditB) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, auditA.clientId))
    .limit(1);
  if (!client) notFound();

  const [issuesA, issuesB] = await Promise.all([
    db
      .select()
      .from(auditIssues)
      .where(eq(auditIssues.auditId, aId))
      .orderBy(asc(auditIssues.severity)),
    db
      .select()
      .from(auditIssues)
      .where(eq(auditIssues.auditId, bId))
      .orderBy(asc(auditIssues.severity)),
  ]);

  // Always treat A as "older", B as "newer" by completedAt
  const aOlder =
    (auditA.completedAt?.getTime() ?? 0) <=
    (auditB.completedAt?.getTime() ?? 0);
  const olderAudit = aOlder ? auditA : auditB;
  const newerAudit = aOlder ? auditB : auditA;
  const olderIssues = aOlder ? issuesA : issuesB;
  const newerIssues = aOlder ? issuesB : issuesA;

  const olderKeys = new Set(olderIssues.map(keyOf));
  const newerKeys = new Set(newerIssues.map(keyOf));

  const newIssues = newerIssues.filter((i) => !olderKeys.has(keyOf(i)));
  const fixedIssues = olderIssues.filter((i) => !newerKeys.has(keyOf(i)));
  const persistedIssues = newerIssues.filter((i) => olderKeys.has(keyOf(i)));

  const scoreDelta =
    newerAudit.score !== null && olderAudit.score !== null
      ? newerAudit.score - olderAudit.score
      : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 px-6 py-7 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/15 blur-[100px]" />
        <div className="pointer-events-none absolute -right-16 -bottom-16 size-56 rounded-full bg-cyan-500/15 blur-[80px]" />

        <nav className="relative flex items-center gap-1 text-xs text-muted-foreground">
          <Link
            href="/clients"
            className="rounded px-1 py-0.5 hover:bg-white/5 hover:text-foreground"
          >
            Clients
          </Link>
          <span>/</span>
          <Link
            href={`/clients/${client.id}`}
            className="rounded px-1 py-0.5 hover:bg-white/5 hover:text-foreground"
          >
            {client.name}
          </Link>
          <span>/</span>
          <span className="text-foreground">
            Compare audit #{olderAudit.id} → #{newerAudit.id}
          </span>
        </nav>

        <div className="relative z-10 mt-4 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-fuchsia-500/15 ring-1 ring-fuchsia-400/30">
            <ArrowRightLeft className="size-5 text-fuchsia-300" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              <span className="text-gradient-brand">Audit comparison</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{client.name}</p>
          </div>
        </div>

        <div className="relative z-10 mt-6 grid gap-4 lg:grid-cols-3">
          <DiffCard
            label="Older"
            audit={olderAudit}
            count={olderIssues.length}
            tone="muted"
          />
          <div className="relative flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-5">
            {scoreDelta !== null ? (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Score change
                </div>
                <div
                  className={`mt-2 text-4xl font-bold tracking-tight ${
                    scoreDelta > 0
                      ? "text-gradient-emerald"
                      : scoreDelta < 0
                        ? "text-gradient-rose"
                        : "text-muted-foreground"
                  }`}
                >
                  {scoreDelta > 0 ? "+" : ""}
                  {scoreDelta}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-center text-xs">
                  <div>
                    <div className="text-muted-foreground">Fixed</div>
                    <div className="mt-0.5 font-bold text-emerald-300">
                      {fixedIssues.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">New</div>
                    <div className="mt-0.5 font-bold text-rose-300">
                      {newIssues.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Same</div>
                    <div className="mt-0.5 font-bold text-amber-300">
                      {persistedIssues.length}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                Score not available
              </div>
            )}
          </div>
          <DiffCard
            label="Newer"
            audit={newerAudit}
            count={newerIssues.length}
            tone="bright"
          />
        </div>
      </section>

      {/* Fixed (positives) */}
      {fixedIssues.length > 0 && (
        <DiffSection
          title={`Fixed (${fixedIssues.length})`}
          subtitle="These were in the older audit but didn't appear in the newer one."
          tone="emerald"
          icon={CheckCircle2}
          items={fixedIssues.map((i) => ({
            type: i.type,
            severity: i.severity,
            message: i.message,
            url: i.url,
          }))}
        />
      )}

      {/* New (negatives) */}
      {newIssues.length > 0 && (
        <DiffSection
          title={`New issues (${newIssues.length})`}
          subtitle="These appeared in the newer audit but weren't there before."
          tone="rose"
          icon={Plus}
          items={newIssues.map((i) => ({
            type: i.type,
            severity: i.severity,
            message: i.message,
            url: i.url,
          }))}
        />
      )}

      {/* Persisted (still open) */}
      {persistedIssues.length > 0 && (
        <DiffSection
          title={`Still present (${persistedIssues.length})`}
          subtitle="In both audits — open work."
          tone="amber"
          icon={Minus}
          items={persistedIssues.map((i) => ({
            type: i.type,
            severity: i.severity,
            message: i.message,
            url: i.url,
          }))}
          collapsedByDefault
        />
      )}

      {fixedIssues.length === 0 &&
        newIssues.length === 0 &&
        persistedIssues.length === 0 && (
          <div className="rounded-2xl border border-white/5 bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
            Both audits are clean — no issues to compare.
          </div>
        )}
    </div>
  );
}

function DiffCard({
  label,
  audit,
  count,
  tone,
}: {
  label: string;
  audit: { id: number; score: number | null; completedAt: Date | null };
  count: number;
  tone: "muted" | "bright";
}) {
  return (
    <div
      className={
        tone === "bright"
          ? "relative flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-5 ring-1 ring-violet-500/20"
          : "relative flex items-center gap-4 rounded-2xl border border-white/10 bg-black/10 p-5"
      }
    >
      <ScoreGauge score={audit.score ?? null} size={96} />
      <div className="space-y-0.5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <Link
          href={`/audits/${audit.id}`}
          className="text-sm font-medium hover:underline"
        >
          Audit #{audit.id}
        </Link>
        <div className="text-xs text-muted-foreground">
          {audit.completedAt?.toLocaleString() ?? "—"} · {count} issues
        </div>
      </div>
    </div>
  );
}

function DiffSection({
  title,
  subtitle,
  tone,
  icon: Icon,
  items,
  collapsedByDefault = false,
}: {
  title: string;
  subtitle: string;
  tone: "emerald" | "rose" | "amber";
  icon: typeof CheckCircle2;
  items: { type: string; severity: string; message: string; url: string }[];
  collapsedByDefault?: boolean;
}) {
  const toneMap = {
    emerald: {
      bg: "bg-emerald-500/15 ring-emerald-400/30",
      text: "text-emerald-300",
      glow: "from-emerald-500/15",
    },
    rose: {
      bg: "bg-rose-500/15 ring-rose-400/30",
      text: "text-rose-300",
      glow: "from-rose-500/15",
    },
    amber: {
      bg: "bg-amber-500/15 ring-amber-400/30",
      text: "text-amber-300",
      glow: "from-amber-500/15",
    },
  }[tone];

  return (
    <details
      open={!collapsedByDefault}
      className="group/section relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md"
    >
      <div
        className={`pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-gradient-to-br ${toneMap.glow} to-transparent blur-3xl`}
      />
      <summary className="relative flex cursor-pointer items-center gap-3 border-b border-white/5 px-5 py-4">
        <div
          className={`flex size-9 items-center justify-center rounded-xl ring-1 ${toneMap.bg}`}
        >
          <Icon className={`size-4 ${toneMap.text}`} />
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </summary>
      <ul className="relative divide-y divide-white/5">
        {items.slice(0, 50).map((it, i) => (
          <li key={i} className="px-5 py-3">
            <div className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">
                    {it.type.replace(/_/g, " ")}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-muted-foreground ring-1 ring-inset ring-white/10">
                    {it.severity}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{it.message}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {it.url}
                </p>
              </div>
            </div>
          </li>
        ))}
        {items.length > 50 && (
          <li className="px-5 py-3 text-center text-xs text-muted-foreground">
            +{items.length - 50} more
          </li>
        )}
      </ul>
    </details>
  );
}
