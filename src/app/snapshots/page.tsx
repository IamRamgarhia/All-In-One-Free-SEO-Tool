export const dynamic = "force-dynamic";

import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ClipboardList,
  Save,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { listSnapshots, snapshotKindLabel } from "@/lib/snapshots";
import { PageHeader } from "@/components/shell/page-header";

export default async function SnapshotsPage() {
  const tx = await getTranslations("ui.app_snapshots_page");
  const locale = await getLocale();
  const all = await listSnapshots({ limit: 200 });

  // Group by label (URL/key) so users can compare snapshots of the same target
  const grouped = new Map<
    string,
    typeof all
  >();
  for (const s of all) {
    const key = `${s.kind}::${s.label}`;
    const arr = grouped.get(key) ?? [];
    arr.push(s);
    grouped.set(key, arr);
  }

  const groups = [...grouped.entries()]
    .map(([key, rows]) => ({ key, rows }))
    .sort(
      (a, b) =>
        b.rows[0].capturedAt.getTime() - a.rows[0].capturedAt.getTime(),
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={tx("savedSnapshots")}
        description={tx("everyResultYouSavedFrom")}
        icon={Save}
        accent="violet"
      />

      {groups.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {tx("noSnapshotsYetRunAny")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ key, rows }) => {
            const latest = rows[0];
            const prior = rows[1];
            const delta =
              prior?.primaryMetric != null && latest.primaryMetric != null
                ? latest.primaryMetric - prior.primaryMetric
                : null;
            return (
              <section
                key={key}
                className="glass-apple relative overflow-hidden rounded-2xl"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30">
                        {snapshotKindLabel(latest.kind)}
                      </span>
                      <span className="truncate font-mono text-sm">
                        {latest.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tx("otherNewest", { length: rows.length, v: latest.capturedAt.toLocaleString(locale) })}
                    </div>
                  </div>
                  {rows.length >= 2 && (
                    <Link
                      href={`/snapshots/compare?a=${rows[1].id}&b=${rows[0].id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
                    >
                      {tx("compareLast2")}
                      <ArrowRight className="size-3" />
                    </Link>
                  )}
                </header>
                <ul className="divide-y divide-white/[0.04]">
                  {rows.slice(0, 6).map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="size-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {s.capturedAt.toLocaleString(locale)}
                        </span>
                        {s.note && (
                          <span className="text-xs text-foreground/80">
                            {s.note}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {s.primaryMetric !== null && (
                          <span className="font-mono text-sm tabular-nums">
                            {s.primaryMetric}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {s.primaryMetricLabel}
                            </span>
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {delta !== null && (
                  <footer
                    className={`flex items-center gap-1.5 border-t border-white/[0.06] px-5 py-2 text-xs ${
                      delta > 0
                        ? "text-emerald-300"
                        : delta < 0
                          ? "text-rose-300"
                          : "text-muted-foreground"
                    }`}
                  >
                    {delta > 0 ? (
                      <TrendingUp className="size-3" />
                    ) : delta < 0 ? (
                      <TrendingDown className="size-3" />
                    ) : null}
                    {tx("sincePreviousSnapshot", { v: delta > 0 ? "+" : "", delta, primaryMetricLabel: latest.primaryMetricLabel ?? "" })}
                  </footer>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="glass-apple relative overflow-hidden rounded-2xl p-5 text-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="size-4 text-violet-300" />
          {tx("howToAddSnapshots")}
        </h2>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>
            {tx.rich("seoHealthCheckToolsHealth", { b0: (chunks) => <strong>{chunks}</strong> })}
          </li>
          <li>
            {tx.rich("httpHeadersRedirectsToolsHeaders", { b0: (chunks) => <strong>{chunks}</strong> })}
          </li>
          <li>
            {tx("perClientToolsCwvEtc")}
          </li>
        </ul>
      </div>
    </div>
  );
}
