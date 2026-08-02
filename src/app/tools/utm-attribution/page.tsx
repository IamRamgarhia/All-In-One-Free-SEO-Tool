"use client";

import { useActionState, useState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import { Loader2, Network } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { runAttribution, type AttrState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";

const SAMPLE = `userId,timestamp,source,medium,campaign,isConversion
user-1,2026-04-01T10:00:00Z,google,organic,,0
user-1,2026-04-03T14:00:00Z,facebook,social,brand-awareness,0
user-1,2026-04-05T09:00:00Z,email,email,welcome,1
user-2,2026-04-02T08:00:00Z,google,cpc,brand,0
user-2,2026-04-02T18:00:00Z,direct,(none),,1
user-3,2026-04-04T12:00:00Z,reddit,social,community,0
user-3,2026-04-06T09:00:00Z,google,organic,,1`;

export default function UtmAttributionPage() {
  const [state, formAction, pending] = useActionState<AttrState, FormData>(
    runAttribution,
    null,
  );
  const [touches, setTouches] = useState(SAMPLE);
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Multi-touch attribution (UTM-based)"
        description="Compute first-touch, last-touch, assisted, linear, and position-based attribution from UTM-tagged touch data. No CRM needed — works with GA4 export, Mixpanel, or any CSV with userId / source / medium / campaign columns."
        icon={Network}
        accent="violet"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            Paste touch data (CSV with header row recommended)
          </span>
          <textarea
            name="touches"
            value={touches}
            onChange={(e) => setTouches(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-white/10 bg-card/60 p-3 font-mono text-[12px]"
          />
          <span className="block text-[10px] text-muted-foreground">
            Columns: <code>userId</code>, <code>timestamp</code>,{" "}
            <code>source</code>, <code>medium</code>, <code>campaign</code>,
            optional <code>content</code>, <code>term</code>,{" "}
            <code>landingPath</code>, <code>isConversion</code> (0 or 1).
          </span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Computing…
            </>
          ) : (
            <>
              <Network className="mr-2 size-4" />
              Run attribution
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Total touches" value={state.result.totalTouches} />
            <Stat label="Unique users" value={state.result.uniqueUsers} />
            <Stat
              label="Conversions"
              value={state.result.totalConversions}
              tone="emerald"
            />
            <Stat
              label="Avg path length"
              value={state.result.averagePathLength.toFixed(1)}
            />
          </div>

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h2 className="text-sm font-semibold">Channel attribution</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Compare models — first-touch and last-touch tell different
                stories. Linear and position-based are the most balanced.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Channel</th>
                    <th className="px-4 py-2 text-right">First-touch</th>
                    <th className="px-4 py-2 text-right">Last-touch</th>
                    <th className="px-4 py-2 text-right">Assisted</th>
                    <th className="px-4 py-2 text-right">Linear</th>
                    <th className="px-4 py-2 text-right">Position-based</th>
                    <th className="px-4 py-2 text-right">Path inclusion</th>
                  </tr>
                </thead>
                <tbody>
                  {state.result.channels.map((c) => (
                    <tr key={c.channel} className="border-t border-white/[0.04]">
                      <td className="px-4 py-2 font-medium">{c.channel}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {c.firstTouches}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {c.lastTouches}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {c.assistedTouches}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-300">
                        {c.linearCredit.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-violet-300">
                        {c.positionCredit.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {c.pathInclusion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {state.result.topPaths.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h2 className="text-sm font-semibold">Top conversion paths</h2>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {state.result.topPaths.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 px-5 py-2 text-sm"
                  >
                    <code className="min-w-0 flex-1 truncate">
                      {p.path.join(" → ")}
                    </code>
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                      {p.count} conv
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <RecentRuns toolId="utm-attribution" refreshKey={refreshKey} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "white",
}: {
  label: string;
  value: number | string;
  tone?: "white" | "emerald";
}) {
  const t = tone === "emerald" ? "text-emerald-300" : "text-foreground";
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${t}`}>
        {value}
      </div>
    </div>
  );
}
