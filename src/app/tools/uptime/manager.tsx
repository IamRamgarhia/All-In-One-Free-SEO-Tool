"use client";

import { useState, useTransition } from "react";
import {
  Activity,
  CheckCircle2,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import {
  addTarget,
  deleteTarget,
  toggleTarget,
  runPingNow,
} from "./actions";
import type { UptimeTarget } from "@/db/schema";

type Row = {
  target: UptimeTarget;
  pings7d: number;
  okPct: number;
  avgLatency: number;
  lastChecked: Date | null;
  lastOk: boolean | null;
};

export function UptimeManager({ initial }: { initial: Row[] }) {
  const [, startMut] = useTransition();
  const [pinging, setPinging] = useState(false);
  const [pingMsg, setPingMsg] = useState<string | null>(null);

  function ping() {
    setPinging(true);
    setPingMsg(null);
    startMut(async () => {
      const r = await runPingNow();
      setPinging(false);
      setPingMsg(`Pinged ${r.total} target${r.total === 1 ? "" : "s"} — ${r.ok} ok / ${r.failed} failed.`);
    });
  }

  return (
    <>
      <form
        action={async (fd) => {
          await addTarget(fd);
        }}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <input
            name="url"
            required
            placeholder="https://yoursite.com"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <input
            name="label"
            placeholder="Label (optional)"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Expected status</span>
            <input
              type="number"
              name="expectedStatus"
              defaultValue={200}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="md:col-span-2 space-y-1 text-xs">
            <span className="text-muted-foreground">Expected text (optional)</span>
            <input
              name="expectedText"
              placeholder="Cart · Login · Acme — phrase that proves the page rendered"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-emerald-500/15 px-4 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
          >
            <Plus className="mr-2 size-3" />
            Add target
          </button>
          <button
            type="button"
            onClick={ping}
            disabled={pinging}
            className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {pinging ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Pinging…
              </>
            ) : (
              <>
                <Zap className="mr-2 size-3" />
                Ping all now
              </>
            )}
          </button>
          {pingMsg && <span className="text-xs text-emerald-300">{pingMsg}</span>}
        </div>
      </form>

      {initial.length === 0 && (
        <p className="rounded-md bg-white/[0.02] px-3 py-2 text-sm text-muted-foreground">
          No targets yet. Add one above.
        </p>
      )}

      {initial.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4 text-emerald-300" />
              Targets ({initial.length})
            </h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              7-day uptime + average latency. Hit &quot;Ping all now&quot; or wire into
              your scheduler for continuous monitoring.
            </p>
          </header>
          <ul className="divide-y divide-white/[0.05]">
            {initial.map((r) => (
              <li
                key={r.target.id}
                className={`grid grid-cols-[1fr_auto_auto_auto] gap-3 px-5 py-2 text-xs items-center ${r.target.enabled ? "" : "opacity-60"}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {r.lastOk === null ? (
                      <Activity className="size-3 text-muted-foreground" />
                    ) : r.lastOk ? (
                      <CheckCircle2 className="size-3 text-emerald-300" />
                    ) : (
                      <XCircle className="size-3 text-rose-300" />
                    )}
                    <span className="truncate">
                      {r.target.label ?? r.target.url}
                    </span>
                  </div>
                  {r.target.label && (
                    <code className="block truncate text-[10px] text-muted-foreground">
                      {r.target.url}
                    </code>
                  )}
                </div>
                <span className={`tabular-nums ${r.okPct < 99 && r.pings7d > 5 ? "text-rose-300" : "text-emerald-300"}`}>
                  {r.pings7d > 0 ? `${r.okPct.toFixed(1)}%` : "—"}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {r.avgLatency > 0 ? `${r.avgLatency}ms` : "—"}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      startMut(async () => {
                        await toggleTarget(r.target.id, !r.target.enabled);
                      })
                    }
                    className="inline-flex h-7 items-center rounded-md bg-white/5 px-2 text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  >
                    {r.target.enabled ? (
                      <PowerOff className="size-3" />
                    ) : (
                      <Power className="size-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startMut(async () => {
                        await deleteTarget(r.target.id);
                      })
                    }
                    className="inline-flex h-7 items-center rounded-md bg-rose-500/10 px-2 text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
