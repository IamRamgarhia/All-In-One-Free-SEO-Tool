export const dynamic = "force-dynamic";

import { gte, desc, eq, sql as drizzleSql, count, sum } from "drizzle-orm";
import { Activity, Coins, Users, Zap } from "lucide-react";
import Link from "next/link";
import { db } from "@/db/client";
import { aiCalls, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { microsToDisplay } from "@/lib/ai-cost";
import { getSetting } from "@/lib/settings-store";
import { CapForm } from "./cap-form";
import { UsageCharts } from "./usage-charts";

export default async function AiUsagePage() {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  // Aggregates last 30 days
  const recentCalls = await db
    .select()
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, since))
    .orderBy(desc(aiCalls.createdAt))
    .limit(500);

  const total = recentCalls.length;
  const totalIn = recentCalls.reduce((s, r) => s + r.promptTokens, 0);
  const totalOut = recentCalls.reduce((s, r) => s + r.completionTokens, 0);
  const totalCost = recentCalls.reduce((s, r) => s + r.costMicros, 0);

  // Today
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayCalls = recentCalls.filter((r) => r.createdAt >= today);
  const todayCost = todayCalls.reduce((s, r) => s + r.costMicros, 0);

  // This calendar month for cap display
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthCost = recentCalls
    .filter((r) => r.createdAt >= monthStart)
    .reduce((s, r) => s + r.costMicros, 0);

  // Per-feature breakdown
  const byFeature = new Map<string, { calls: number; cost: number; tokens: number }>();
  for (const r of recentCalls) {
    const k = r.feature;
    const cur = byFeature.get(k) ?? { calls: 0, cost: 0, tokens: 0 };
    cur.calls += 1;
    cur.cost += r.costMicros;
    cur.tokens += r.totalTokens;
    byFeature.set(k, cur);
  }
  const featureRows = Array.from(byFeature.entries())
    .map(([k, v]) => ({ feature: k, ...v }))
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls);

  // Per-provider breakdown
  const byProvider = new Map<string, { calls: number; cost: number; tokens: number }>();
  for (const r of recentCalls) {
    const k = r.provider;
    const cur = byProvider.get(k) ?? { calls: 0, cost: 0, tokens: 0 };
    cur.calls += 1;
    cur.cost += r.costMicros;
    cur.tokens += r.totalTokens;
    byProvider.set(k, cur);
  }
  const providerRows = Array.from(byProvider.entries())
    .map(([k, v]) => ({ provider: k, ...v }))
    .sort((a, b) => b.cost - a.cost);

  // Per-client breakdown — full SQL aggregation (not limited to the
  // 500-row recentCalls window), so high-volume clients show their
  // real footprint even when other clients dominate the recent list.
  // Joins clients table for names; orphaned client_id rows show as "—".
  const perClientRaw = await db
    .select({
      clientId: aiCalls.clientId,
      clientName: clients.name,
      calls: count(aiCalls.id),
      cost: sum(aiCalls.costMicros),
      tokens: sum(aiCalls.totalTokens),
    })
    .from(aiCalls)
    .leftJoin(clients, eq(aiCalls.clientId, clients.id))
    .where(gte(aiCalls.createdAt, since))
    .groupBy(aiCalls.clientId)
    .orderBy(desc(sum(aiCalls.costMicros)));
  const clientRows = perClientRaw.map((r) => ({
    clientId: r.clientId,
    clientName: r.clientName ?? (r.clientId === null ? "Workspace-wide" : "(deleted client)"),
    calls: Number(r.calls ?? 0),
    cost: Number(r.cost ?? 0),
    tokens: Number(r.tokens ?? 0),
  }));

  // Daily sparkline
  const days: { day: string; calls: number; cost: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    const slice = recentCalls.filter(
      (r) => r.createdAt >= d && r.createdAt < next,
    );
    days.push({
      day: d.toISOString().slice(5, 10),
      calls: slice.length,
      cost: slice.reduce((s, r) => s + r.costMicros, 0),
    });
  }
  const cap = (await getSetting<number | string>("ai.monthly_cap_usd")) ?? "";
  const capUsd = Number(cap);
  const monthSpentUsd = monthCost / 1_000_000;
  const capPct =
    capUsd > 0 && Number.isFinite(capUsd)
      ? Math.min(100, (monthSpentUsd / capUsd) * 100)
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="AI usage"
        description="Live tally of every AI call your tool makes — calls, tokens, estimated cost. Set a monthly cap to prevent runaway spend."
        icon={Activity}
        accent="violet"
      />

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Stat
          label="Today"
          value={`${todayCalls.length} calls`}
          hint={microsToDisplay(todayCost)}
          tone="violet"
        />
        <Stat
          label="Last 30 days"
          value={`${total} calls`}
          hint={`${(totalIn + totalOut).toLocaleString()} tokens`}
          tone="cyan"
        />
        <Stat
          label="30-day cost"
          value={microsToDisplay(totalCost)}
          hint={`in ${totalIn.toLocaleString()} · out ${totalOut.toLocaleString()}`}
          tone="amber"
        />
        <Stat
          label="This month"
          value={microsToDisplay(monthCost)}
          hint={
            capUsd > 0
              ? `cap $${capUsd.toFixed(2)} · ${capPct?.toFixed(0)}% used`
              : "no cap"
          }
          tone={capPct && capPct > 80 ? "rose" : "emerald"}
        />
      </div>

      {/* Cap progress */}
      {capPct !== null && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="size-4 text-amber-300" />
              Monthly cap progress
            </h2>
            <span className="text-xs text-muted-foreground">
              ${monthSpentUsd.toFixed(3)} of ${capUsd.toFixed(2)}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${
                capPct >= 90
                  ? "bg-rose-400/70"
                  : capPct >= 70
                    ? "bg-amber-400/70"
                    : "bg-emerald-400/70"
              }`}
              style={{ width: `${capPct}%` }}
            />
          </div>
        </section>
      )}

      {/* Daily bar chart + per-feature donut — Tremor-powered */}
      <UsageCharts days={days} featureRows={featureRows} />

      {/* Cap form */}
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Coins className="size-4 text-amber-300" />
          Monthly cap (USD)
        </h2>
        <p className="text-xs text-muted-foreground">
          When the calendar-month total exceeds this cap, every callAI returns
          null with a &quot;cap reached&quot; error. Useful as a runaway-loop seatbelt.
          Leave blank for no cap.
        </p>
        <CapForm initial={String(cap ?? "")} />
      </section>

      {/* Per feature */}
      {featureRows.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-3">
            <h2 className="text-sm font-semibold">Cost by feature</h2>
          </header>
          <ul className="divide-y divide-white/[0.05]">
            {featureRows.map((r) => (
              <li
                key={r.feature}
                className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs"
              >
                <span className="font-medium">{r.feature}</span>
                <span className="text-muted-foreground tabular-nums">
                  {r.calls} calls · {r.tokens.toLocaleString()} tok ·{" "}
                  <span className="font-medium text-foreground">
                    {microsToDisplay(r.cost)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Per provider */}
      {providerRows.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-3">
            <h2 className="text-sm font-semibold">Cost by provider</h2>
          </header>
          <ul className="divide-y divide-white/[0.05]">
            {providerRows.map((r) => (
              <li
                key={r.provider}
                className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs"
              >
                <span className="font-medium">{r.provider}</span>
                <span className="text-muted-foreground tabular-nums">
                  {r.calls} calls · {r.tokens.toLocaleString()} tok ·{" "}
                  <span className="font-medium text-foreground">
                    {microsToDisplay(r.cost)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Per client. Critical for agencies — see which clients are
          actually driving the AI bill, then either rein them in,
          bill them through, or upgrade the plan. Full-table SQL
          aggregation so high-volume clients aren't truncated. */}
      {clientRows.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-3 flex items-center gap-2">
            <Users className="size-4 text-cyan-300" />
            <h2 className="text-sm font-semibold">Cost by client</h2>
            <span className="text-[10px] text-muted-foreground">
              (last 30d, full aggregation)
            </span>
          </header>
          <ul className="divide-y divide-white/[0.05]">
            {clientRows.map((r) => {
              const row = (
                <span className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                  <span className="font-medium">{r.clientName}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {r.calls} calls · {r.tokens.toLocaleString()} tok ·{" "}
                    <span className="font-medium text-foreground">
                      {microsToDisplay(r.cost)}
                    </span>
                  </span>
                </span>
              );
              return (
                <li key={r.clientId ?? "workspace"}>
                  {r.clientId ? (
                    <Link
                      href={`/clients/${r.clientId}`}
                      className="block hover:bg-white/[0.02]"
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Recent calls */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-sm font-semibold">
            Last {Math.min(50, recentCalls.length)} calls
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Feature</th>
                <th className="px-4 py-2 text-left">Provider</th>
                <th className="px-4 py-2 text-right">Tok in</th>
                <th className="px-4 py-2 text-right">Tok out</th>
                <th className="px-4 py-2 text-right">Cost</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentCalls.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-t border-white/[0.04]">
                  <td className="px-4 py-1.5 text-muted-foreground">
                    {r.createdAt.toLocaleString().slice(5, 17)}
                  </td>
                  <td className="px-4 py-1.5">{r.feature}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">
                    {r.provider}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">
                    {r.promptTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">
                    {r.completionTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">
                    {microsToDisplay(r.costMicros)}
                  </td>
                  <td className="px-4 py-1.5">
                    {r.status === "ok" ? (
                      <span className="text-emerald-300">✓</span>
                    ) : r.status === "blocked_by_cap" ? (
                      <span className="text-amber-300">capped</span>
                    ) : (
                      <span
                        className="text-rose-300"
                        title={r.errorMsg ?? "error"}
                      >
                        ✗
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentCalls.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">
              No AI calls in the last 30 days.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "emerald" | "amber" | "rose" | "cyan" | "violet";
}) {
  const t = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    cyan: "text-cyan-300",
    violet: "text-violet-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${t}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ = drizzleSql;