"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Loader2, Mail, Power, PowerOff } from "lucide-react";
import type { WeeklyDigest } from "@/lib/weekly-digest";
import {
  sendDigest,
  setSchedule,
  type SendState,
  type ScheduleState,
} from "./actions";

export function DigestView({
  digest,
  initialEmail,
  autoSendEnabled,
  lastSentAt,
}: {
  digest: WeeklyDigest;
  initialEmail: string;
  autoSendEnabled: boolean;
  lastSentAt: string | null;
}) {
  const [tab, setTab] = useState<"summary" | "text" | "html">("summary");
  const [copied, setCopied] = useState<string | null>(null);
  const [sendState, sendAction, sending] = useActionState<
    SendState | null,
    FormData
  >(sendDigest, null);
  const [schedState, schedAction, savingSched] = useActionState<
    ScheduleState | null,
    FormData
  >(setSchedule, null);

  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
        <Stat label="Period" value={`${digest.weekStart} → ${digest.weekEnd}`} />
        <Stat label="Audits" value={digest.totals.auditsRun.toString()} />
        <Stat label="Tasks shipped" value={digest.totals.tasksDone.toString()} tone="emerald" />
        <Stat label="Improved" value={digest.totals.clientsImproved.toString()} tone="emerald" />
        <Stat label="Dropped" value={digest.totals.clientsDropped.toString()} tone={digest.totals.clientsDropped > 0 ? "rose" : "emerald"} />
      </div>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Mail className="size-4 text-cyan-300" />
          Send + auto-schedule
        </h3>
        <p className="text-xs text-muted-foreground">
          Send this digest right now, or auto-send every Monday 09:00 UTC via
          your configured SMTP. Configure SMTP in Settings → Email if you
          haven&apos;t already.
        </p>
        <form action={sendAction} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input
            name="to"
            type="email"
            required
            defaultValue={initialEmail}
            placeholder="recipient@yourdomain.com"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <input
            name="subject"
            defaultValue="Weekly SEO digest"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={sending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-cyan-500/15 px-4 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Mail className="mr-2 size-3" />
                Send now
              </>
            )}
          </button>
        </form>
        {sendState?.ok && (
          <p className="text-xs text-emerald-300">
            ✓ Sent. {lastSentAt ? `(last: ${lastSentAt})` : ""}
          </p>
        )}
        {sendState && !sendState.ok && (
          <p className="text-xs text-rose-300">{sendState.error}</p>
        )}

        <form
          action={schedAction}
          className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3"
        >
          <input type="hidden" name="email" defaultValue={initialEmail} />
          <input
            type="checkbox"
            name="enabled"
            id="digest-auto"
            defaultChecked={autoSendEnabled}
            className="size-4"
          />
          <label htmlFor="digest-auto" className="text-xs">
            Auto-send every Monday 09:00 UTC to{" "}
            <code className="rounded bg-white/5 px-1 py-0.5">
              {initialEmail || "(set above first)"}
            </code>
          </label>
          <button
            type="submit"
            disabled={savingSched}
            className={`ml-auto inline-flex h-7 items-center rounded-md px-3 text-[11px] ring-1 ring-inset ${
              autoSendEnabled
                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                : "bg-white/5 text-muted-foreground ring-white/10"
            } hover:bg-white/10`}
          >
            {savingSched ? (
              <>
                <Loader2 className="mr-1 size-3 animate-spin" />
                Saving…
              </>
            ) : autoSendEnabled ? (
              <>
                <Power className="mr-1 size-3" />
                Enabled — save changes
              </>
            ) : (
              <>
                <PowerOff className="mr-1 size-3" />
                Save schedule
              </>
            )}
          </button>
        </form>
        {schedState?.ok && (
          <p className="text-xs text-emerald-300">{schedState.message}</p>
        )}
        {schedState && !schedState.ok && (
          <p className="text-xs text-rose-300">{schedState.error}</p>
        )}
      </section>

      {digest.algoOverlaps.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
          <h3 className="text-sm font-semibold">Algorithm updates this week</h3>
          <ul className="space-y-1 text-xs">
            {digest.algoOverlaps.map((u) => (
              <li
                key={u.name}
                className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300 ring-1 ring-inset ring-amber-500/30"
              >
                {u.name} <span className="text-muted-foreground">({u.type})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2 border-b border-white/[0.06]">
        {(["summary", "text", "html"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "summary" ? "Per-client" : t === "text" ? "Plain text" : "HTML email"}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Client</th>
                  <th className="px-4 py-2 text-right">Score</th>
                  <th className="px-4 py-2 text-right">Δ</th>
                  <th className="px-4 py-2 text-left">Trend</th>
                  <th className="px-4 py-2 text-right">Tasks</th>
                  <th className="px-4 py-2 text-left">Wins</th>
                  <th className="px-4 py-2 text-left">Concerns</th>
                </tr>
              </thead>
              <tbody>
                {digest.rows.map((r) => (
                  <tr key={r.clientId} className="border-t border-white/[0.04]">
                    <td className="px-4 py-1.5 font-medium">{r.clientName}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {r.scoreLatest ?? "—"}
                    </td>
                    <td
                      className={`px-4 py-1.5 text-right tabular-nums ${
                        r.scoreDelta === null
                          ? "text-muted-foreground"
                          : r.scoreDelta > 0
                            ? "text-emerald-300"
                            : r.scoreDelta < 0
                              ? "text-rose-300"
                              : "text-muted-foreground"
                      }`}
                    >
                      {r.scoreDelta !== null
                        ? `${r.scoreDelta > 0 ? "+" : ""}${r.scoreDelta}`
                        : "—"}
                    </td>
                    <td className="px-4 py-1.5">
                      <Sparkbar values={r.scoreHistory} />
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                      {r.tasksDoneThisWeek}
                    </td>
                    <td className="px-4 py-1.5 text-emerald-300">
                      {r.highlight && `✓ ${r.highlight}`}
                    </td>
                    <td className="px-4 py-1.5 text-amber-300">{r.concern}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "text" && (
        <CopyBlock
          label="Plain text"
          code={digest.textVersion}
          copied={copied === "text"}
          onCopy={() => copy("text", digest.textVersion)}
        />
      )}
      {tab === "html" && (
        <CopyBlock
          label="HTML email"
          code={digest.htmlVersion}
          copied={copied === "html"}
          onCopy={() => copy("html", digest.htmlVersion)}
        />
      )}
    </>
  );
}

/**
 * Per-row health-score trend, 8 bars tall. Mirrors the inline sparkbar
 * in the HTML email so the in-app summary tab matches what recipients
 * will see in their inbox. Color follows direction: emerald if last is
 * higher, rose if lower, gray if flat.
 */
function Sparkbar({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const first = values[0];
  const last = values[values.length - 1];
  const color =
    last > first
      ? "bg-emerald-400"
      : last < first
        ? "bg-rose-400"
        : "bg-muted-foreground";
  return (
    <span className="inline-flex h-4 items-end gap-px">
      {values.map((v, i) => {
        const pct = Math.max(15, ((v - min) / range) * 100);
        return (
          <span
            key={i}
            className={`w-1 rounded-sm ${color}`}
            style={{ height: `${pct.toFixed(0)}%` }}
          />
        );
      })}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "rose";
}) {
  const t = tone
    ? { emerald: "text-emerald-300", amber: "text-amber-300", rose: "text-rose-300" }[tone]
    : "";
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${t}`}>
        {value}
      </div>
    </div>
  );
}

function CopyBlock({
  label,
  code,
  copied,
  onCopy,
}: {
  label: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <span className="text-sm font-semibold">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-7 items-center rounded-md bg-white/5 px-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="mr-1 size-3 text-emerald-300" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-1 size-3" />
              Copy
            </>
          )}
        </button>
      </header>
      <pre className="max-h-[500px] overflow-auto p-4 font-mono text-[11px] leading-relaxed">
        {code}
      </pre>
    </section>
  );
}
