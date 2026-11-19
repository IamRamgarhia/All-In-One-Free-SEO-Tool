"use client";

import { useState, useTransition } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { LEVEL_DESCRIPTIONS, type AutonomyLevel } from "@/lib/agent/autonomy-levels";
// trial-shared, not trial: the latter imports the database, and this
// is a client component. The build caught it.
import { TRIAL_SIZE, type TrialResult } from "@/lib/agent/trial-shared";
import { runTrialAction } from "./agent/autopilot/actions";
import { chooseAutonomyAction } from "./autonomy-actions";

/**
 * Three options, in the order a person should consider them, with the
 * consequence of each stated rather than implied.
 *
 * "Off" is not offered here. Someone who wants the agent not to run at
 * all is choosing something different from the question being asked, and
 * the setting is one click away in agent settings. Offering four options
 * to answer "how much may it do" made the choice harder without making
 * it better.
 */
const OPTIONS: { level: AutonomyLevel; label: string; hint: string }[] = [
  {
    level: "suggest",
    label: "Just tell me",
    hint: "Finds everything, changes nothing. You apply what you agree with.",
  },
  {
    level: "apply_safe",
    label: "Fix the obvious things",
    hint: "Applies fixes that are wrong by a measurable rule. Queues judgement calls for you.",
  },
  {
    level: "apply_all",
    label: "Do it all",
    hint: "Applies everything it proposes, including wording. You review after the fact.",
  },
];

export function AutonomyChoice({
  current,
  waiting = null,
  trialWaiting = null,
  trialOldestDays = null,
}: {
  current: AutonomyLevel;
  /**
   * How many SAFE changes are queued, and how long the oldest has
   * waited — the numbers that make the trial offer concrete. Null when
   * there is nothing queued, in which case no offer is shown: "try it
   * on 3" with nothing to apply would be a dead button.
   */
  trialWaiting?: number | null;
  trialOldestDays?: number | null;
  /**
   * One sentence naming how much the agent is holding, when it is
   * holding anything. Null on a fresh install, where "0 changes are
   * waiting" would be noise on the first screen somebody sees.
   */
  waiting?: string | null;
}) {
  const [picked, setPicked] = useState<AutonomyLevel | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const choose = (level: AutonomyLevel) => {
    setPicked(level);
    setError(null);
    start(async () => {
      const r = await chooseAutonomyAction(level);
      if (!r.ok) {
        setError(r.error);
        setPicked(null);
        return;
      }
      setDone(true);
    });
  };

  if (done) return null;

  return (
    <section className="glass-apple overflow-hidden rounded-2xl">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Bot className="mt-0.5 size-4 shrink-0 text-violet-400" />
        <span>
          <h2 className="text-sm font-semibold">
            How much should the agent do on its own?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {waiting ? (
              <>
                <span className="font-medium text-amber-300">{waiting}</span>{" "}
                The agent finds work every night and changes nothing, because
                nobody has answered this yet.
              </>
            ) : (
              <>
                It currently finds work every night and changes nothing,
                because nobody has answered this yet.
              </>
            )}{" "}
            Every change it makes is logged with the previous value and can be
            undone in one click. You can change this any time in agent
            settings.
          </p>
        </span>
      </header>

      <div className="grid gap-2 p-4 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button
            key={o.level}
            type="button"
            disabled={picked !== null}
            onClick={() => choose(o.level)}
            className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors ${
              o.level === current
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:border-ring/50 hover:bg-accent"
            } disabled:opacity-60`}
            title={LEVEL_DESCRIPTIONS[o.level]}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-medium">
              {picked === o.level ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : o.level === current ? (
                <Check className="size-3.5 text-primary" />
              ) : null}
              {o.label}
            </span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              {o.hint}
            </span>
          </button>
        ))}
      </div>

      {/* The smaller question, offered under the big one.
          Measured on this install: 42 changes queued, 3 applied, the
          oldest waiting 68 days, because the question above asks
          somebody to decide permanently how much authority a tool they
          just installed has over a client's live website. "Not yet" is
          a reasonable answer and it never expires.
          This asks for three changes instead of a standing permission. */}
      {trialWaiting !== null && trialWaiting > 0 && !picked && (
        <TrialOffer waiting={trialWaiting} oldestDays={trialOldestDays} />
      )}

      {error && (
        <p className="px-5 pb-4 text-xs text-destructive">{error}</p>
      )}
    </section>
  );
}

/**
 * "Try it on three" — a bounded trial that grants nothing.
 *
 * Deliberately not a fourth autonomy option. An option in that row
 * would read as another permanent setting, which is exactly the
 * commitment people are declining to make.
 */
function TrialOffer({
  waiting,
  oldestDays,
}: {
  waiting: number;
  oldestDays: number | null;
}) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<TrialResult | null>(null);
  const [, start] = useTransition();

  const run = () => {
    setState("running");
    start(async () => {
      const r = await runTrialAction({ limit: TRIAL_SIZE });
      setResult(r);
      setState("done");
    });
  };

  if (state === "done" && result) {
    return (
      <div className="mx-4 mb-4 rounded-xl border border-border bg-card/40 p-3">
        <p className="text-xs font-medium">
          {result.applied > 0 ? "Done — have a look" : "Nothing changed"}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {result.summary}
        </p>
        <Link
          href="/agent/autopilot"
          className="mt-1.5 inline-block rounded text-[11px] font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          See every change, with its previous value →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-4 rounded-xl border border-border bg-card/40 p-3">
      <p className="text-xs font-medium">Not sure? Try it on {TRIAL_SIZE}.</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {waiting} change{waiting === 1 ? "" : "s"} are waiting
        {oldestDays !== null && oldestDays > 0
          ? `, the oldest for ${oldestDays} day${oldestDays === 1 ? "" : "s"}`
          : ""}
        . I&apos;ll apply {TRIAL_SIZE} of the safe ones now — the kind that are
        wrong by a measurable rule, never a rewrite of your wording — and show
        you exactly what changed. No setting changes, and every one can be
        undone in a click.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-60"
      >
        {state === "running" && <Loader2 className="size-3 animate-spin" />}
        {state === "running" ? "Applying…" : `Apply ${TRIAL_SIZE} and show me`}
      </button>
    </div>
  );
}
