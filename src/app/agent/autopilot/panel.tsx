"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LEVEL_DESCRIPTIONS,
  LEVEL_LABELS,
  type AgentSettings,
  type AutonomyLevel,
} from "@/lib/agent/autonomy-levels";
import {
  approveAction,
  rejectAction,
  runNow,
  saveAgentSettings,
  undoAction,
} from "./actions";
import type { SerialisedAction } from "./page";

const LEVELS: AutonomyLevel[] = ["off", "suggest", "apply_safe", "apply_all"];

type RunRow = {
  id: number;
  clientName: string;
  mode: string;
  trigger: string;
  startedAt: string;
  applied: number;
  queued: number;
  failed: number;
  summary: string | null;
  error: string | null;
};

export function AutopilotPanel({
  settings,
  clients,
  pending,
  recent,
  runs,
}: {
  settings: AgentSettings;
  clients: { id: number; name: string }[];
  pending: SerialisedAction[];
  recent: SerialisedAction[];
  runs: RunRow[];
}) {
  const [level, setLevel] = useState(settings.level);
  const [caps, setCaps] = useState(settings);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingOp, start] = useTransition();

  return (
    <div className="space-y-6">
      {/* How much rope */}
      <section className="glass-apple rounded-xl p-5">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-violet-300" />
          How much the agent may do on its own
        </h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={pendingOp}
              onClick={() =>
                start(async () => {
                  setLevel(l);
                  await saveAgentSettings({ level: l });
                })
              }
              className={`rounded-lg border p-3 text-left transition-colors ${
                level === l
                  ? "border-violet-400/50 bg-violet-500/10"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {level === l && <Check className="size-3.5 text-violet-300" />}
                {LEVEL_LABELS[l]}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {LEVEL_DESCRIPTIONS[l]}
              </p>
            </button>
          ))}
        </div>

        {level === "apply_all" && (
          <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-inset ring-amber-500/25">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              On this setting the agent rewrites live pages without asking,
              including judgement calls. Every change is logged with its
              previous value and can be undone here — but you&apos;ll be
              reviewing after the fact. Worth starting on &ldquo;fix the
              obvious things&rdquo; for a week first.
            </span>
          </p>
        )}

        {/* Guardrails */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <NumberField
            label="Changes per run"
            hint="Blast radius if it gets something wrong."
            value={caps.maxActionsPerRun}
            onChange={(v) =>
              start(async () => {
                setCaps({ ...caps, maxActionsPerRun: v });
                await saveAgentSettings({ maxActionsPerRun: v });
              })
            }
          />
          <NumberField
            label="Changes per day"
            hint="Across every run, per client."
            value={caps.maxActionsPerDay}
            onChange={(v) =>
              start(async () => {
                setCaps({ ...caps, maxActionsPerDay: v });
                await saveAgentSettings({ maxActionsPerDay: v });
              })
            }
          />
          <NumberField
            label="Cooldown (days)"
            hint="Won't re-edit the same page for this long."
            value={caps.cooldownDays}
            onChange={(v) =>
              start(async () => {
                setCaps({ ...caps, cooldownDays: v });
                await saveAgentSettings({ cooldownDays: v });
              })
            }
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            disabled={pendingOp || level === "off"}
            onClick={() =>
              start(async () => {
                setMessage(null);
                const r = await runNow();
                setMessage(r.summary);
              })
            }
          >
            {pendingOp ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Run now
          </Button>
          <span className="text-xs text-muted-foreground">
            Runs on its own every 6 hours{clients.length ? ` across ${clients.length} client${clients.length === 1 ? "" : "s"}` : ""}.
          </span>
        </div>

        {message && (
          <p className="mt-3 rounded-md bg-white/5 px-3 py-2 text-xs">{message}</p>
        )}
      </section>

      {/* Waiting on you */}
      {pending.length > 0 && (
        <section className="glass-apple rounded-xl p-5">
          <h2 className="text-sm font-medium">
            Waiting for you ({pending.length})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The agent drafted these but didn&apos;t apply them. Approving uses
            the exact text shown — it won&apos;t regenerate something different.
          </p>
          <ul className="mt-4 space-y-3">
            {pending.map((a) => (
              <ActionCard key={a.id} action={a} mode="approve" onDone={setMessage} />
            ))}
          </ul>
        </section>
      )}

      {/* What it changed */}
      <section className="glass-apple rounded-xl p-5">
        <h2 className="text-sm font-medium">What it changed</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing yet. When the agent changes something on a live site it
            appears here with the previous value, so you can put it back.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recent.map((a) => (
              <ActionCard key={a.id} action={a} mode="undo" onDone={setMessage} />
            ))}
          </ul>
        )}
      </section>

      {/* Run history */}
      <section className="glass-apple rounded-xl p-5">
        <h2 className="text-sm font-medium">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            The agent hasn&apos;t run yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5 text-xs">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                <span className="text-muted-foreground">
                  {new Date(r.startedAt).toLocaleString()}
                </span>
                <span className="font-medium">{r.clientName}</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {r.trigger}
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {r.error ? (
                    <span className="text-rose-300">{r.error}</span>
                  ) : (
                    (r.summary ?? "—")
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="mt-1 h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm"
      />
      <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>
    </label>
  );
}

function ActionCard({
  action,
  mode,
  onDone,
}: {
  action: SerialisedAction;
  mode: "approve" | "undo";
  onDone: (m: string) => void;
}) {
  const [pendingOp, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const undoable = action.status === "applied" || action.status === "verified";

  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">{action.clientName}</span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {action.kind.replace(/^write_/, "").replace(/_/g, " ")}
        </span>
        <StatusPill status={action.status} verifyNote={action.verifyNote} />
        {action.targetUrl && (
          <a
            href={action.targetUrl}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 truncate text-muted-foreground underline underline-offset-2"
          >
            {action.targetUrl.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>

      {action.reason && (
        <p className="mt-2 text-xs text-muted-foreground">{action.reason}</p>
      )}

      <div className="mt-2 space-y-1 text-xs">
        {action.beforeValue != null && (
          <div className="flex gap-2">
            <span className="w-12 shrink-0 text-muted-foreground">Before</span>
            <span className="min-w-0 break-words text-rose-200/80 line-through decoration-rose-400/40">
              {action.beforeValue || "(empty)"}
            </span>
          </div>
        )}
        {action.afterValue && (
          <div className="flex gap-2">
            <span className="w-12 shrink-0 text-muted-foreground">After</span>
            <span className="min-w-0 break-words text-emerald-200">
              {action.afterValue}
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({action.afterValue.length} chars)
              </span>
            </span>
          </div>
        )}
      </div>

      {action.error && (
        <p className="mt-2 text-xs text-rose-300">{action.error}</p>
      )}

      <div className="mt-3 flex gap-2">
        {mode === "approve" && (
          <>
            <Button
              size="sm"
              disabled={pendingOp}
              onClick={() =>
                start(async () => {
                  const r = await approveAction(action.id);
                  if (r.ok) setGone(true);
                  else onDone(r.error ?? "Couldn't apply that.");
                })
              }
            >
              {pendingOp ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pendingOp}
              onClick={() =>
                start(async () => {
                  await rejectAction(action.id);
                  setGone(true);
                })
              }
            >
              <X className="size-3.5" />
              No thanks
            </Button>
          </>
        )}
        {mode === "undo" && undoable && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pendingOp}
            onClick={() =>
              start(async () => {
                const r = await undoAction(action.id);
                if (r.ok) setGone(true);
                else onDone(r.error ?? "Couldn't undo that.");
              })
            }
          >
            {pendingOp ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            Put it back
          </Button>
        )}
      </div>
    </li>
  );
}

function StatusPill({
  status,
  verifyNote,
}: {
  status: string;
  verifyNote: string | null;
}) {
  // "applied" and "verified" are genuinely different and the distinction
  // is worth a user's attention: applied means the CMS accepted it,
  // verified means we read the page back and found it there. A plugin or
  // a cache can silently override the first.
  const tone =
    status === "verified"
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : status === "applied"
        ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
        : status === "failed"
          ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
          : status === "reverted"
            ? "bg-white/10 text-muted-foreground ring-white/15"
            : "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30";

  const label =
    status === "verified"
      ? "live on the site"
      : status === "applied"
        ? "sent, not confirmed"
        : status;

  return (
    <span
      title={
        verifyNote ??
        (status === "verified"
          ? "We read the page back and found the new value."
          : undefined)
      }
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${tone}`}
    >
      {label}
    </span>
  );
}
