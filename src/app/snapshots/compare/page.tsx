export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  GitCompare,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { db } from "@/db/client";
import { toolSnapshots } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { snapshotKindLabel } from "@/lib/snapshots";

export default async function CompareSnapshotsPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const idA = Number(a);
  const idB = Number(b);
  if (!Number.isFinite(idA) || !Number.isFinite(idB)) notFound();

  const [snapA] = await db
    .select()
    .from(toolSnapshots)
    .where(eq(toolSnapshots.id, idA))
    .limit(1);
  const [snapB] = await db
    .select()
    .from(toolSnapshots)
    .where(eq(toolSnapshots.id, idB))
    .limit(1);

  if (!snapA || !snapB) notFound();

  const sameTarget = snapA.kind === snapB.kind && snapA.label === snapB.label;
  const delta =
    snapA.primaryMetric !== null && snapB.primaryMetric !== null
      ? snapB.primaryMetric - snapA.primaryMetric
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/snapshots"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All snapshots
      </Link>

      <PageHeader
        title="Compare snapshots"
        description={
          sameTarget
            ? `Two snapshots of ${snapshotKindLabel(snapA.kind)} for ${snapA.label}.`
            : "These two snapshots are for different targets — comparing anyway."
        }
        icon={GitCompare}
        accent="violet"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SnapshotPanel side="A (earlier)" snap={snapA} />
        <SnapshotPanel side="B (later)" snap={snapB} />
      </div>

      {delta !== null && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
          <h2 className="text-base font-semibold">
            {snapA.primaryMetricLabel ?? "metric"} change
          </h2>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex items-center gap-3 text-3xl font-bold tabular-nums">
              <span>{snapA.primaryMetric}</span>
              <ArrowRight className="size-5 text-muted-foreground" />
              <span>{snapB.primaryMetric}</span>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium ring-1 ring-inset ${
                delta > 0
                  ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                  : delta < 0
                    ? "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                    : "bg-white/5 text-muted-foreground ring-white/10"
              }`}
            >
              {delta > 0 ? (
                <TrendingUp className="size-3.5" />
              ) : delta < 0 ? (
                <TrendingDown className="size-3.5" />
              ) : (
                <Minus className="size-3.5" />
              )}
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          </div>
        </section>
      )}

      {/* Raw JSON dumps side by side — basic diff viewer */}
      <div className="grid gap-4 md:grid-cols-2">
        <RawDump label="A" data={snapA.data} />
        <RawDump label="B" data={snapB.data} />
      </div>
    </div>
  );
}

function SnapshotPanel({
  side,
  snap,
}: {
  side: string;
  snap: typeof toolSnapshots.$inferSelect;
}) {
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {side}
        </div>
        <h3 className="mt-0.5 truncate font-mono text-sm">{snap.label}</h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="size-3" />
          {snap.capturedAt.toLocaleString()}
        </div>
      </header>
      <div className="p-5">
        {snap.primaryMetric !== null && (
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {snap.primaryMetricLabel ?? "metric"}
            </div>
            <div className="mt-1 text-4xl font-bold tabular-nums text-gradient-violet">
              {snap.primaryMetric}
            </div>
          </div>
        )}
        {snap.note && (
          <p className="mt-3 text-sm text-muted-foreground">{snap.note}</p>
        )}
      </div>
    </section>
  );
}

function RawDump({ label, data }: { label: string; data: unknown }) {
  return (
    <details className="glass-apple relative overflow-hidden rounded-2xl">
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium hover:bg-white/[0.02]">
        Raw JSON · Snapshot {label}
      </summary>
      <pre className="max-h-[400px] overflow-auto border-t border-white/[0.06] p-5 font-mono text-[11px] leading-relaxed text-foreground/80">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
