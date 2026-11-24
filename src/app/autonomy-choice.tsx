"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AutonomyLevel } from "@/lib/agent/autonomy-levels";
import type { WaitingDescription } from "@/lib/agent/waiting-work";
// trial-shared, not trial: the latter imports the database, and this is
// a client component.
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
const OPTIONS: AutonomyLevel[] = ["suggest", "apply_safe", "apply_all"];

export function AutonomyChoice({
  current,
  waiting = null,
  trialWaiting = null,
  trialOldestDays = null,
}: {
  current: AutonomyLevel;
  /**
   * How much the agent is holding, when it is holding anything. Null on
   * a fresh install, where "0 changes are waiting" would be noise on the
   * first screen somebody sees.
   */
  waiting?: WaitingDescription | null;
  /**
   * How many SAFE changes are queued, and how long the oldest has
   * waited. Null when none is queued, in which case no trial is offered:
   * "try it on 3" with nothing to apply would be a dead button.
   */
  trialWaiting?: number | null;
  trialOldestDays?: number | null;
}) {
  const [picked, setPicked] = useState<AutonomyLevel | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const t = useTranslations("dashboard.autonomy");

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
            {t("title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {waiting ? (
              <>
                <span className="font-medium text-amber-600 dark:text-amber-300">
                  {t(`waiting.${waiting.age.unit}`, {
                    count: waiting.count,
                    n: "n" in waiting.age ? waiting.age.n : 0,
                  })}
                </span>{" "}
                {t("bodyAfterWaiting")}
              </>
            ) : (
              t("body")
            )}
          </p>
        </span>
      </header>

      <div className="grid gap-2 p-4 sm:grid-cols-3">
        {OPTIONS.map((level) => (
          <button
            key={level}
            type="button"
            disabled={picked !== null}
            onClick={() => choose(level)}
            className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors ${
              level === current
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:border-ring/50 hover:bg-accent"
            } disabled:opacity-60`}
            title={t(`levels.${level}.description`)}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-medium">
              {picked === level ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : level === current ? (
                <Check className="size-3.5 text-primary" />
              ) : null}
              {t(`levels.${level}.label`)}
            </span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              {t(`levels.${level}.hint`)}
            </span>
          </button>
        ))}
      </div>

      {/* The smaller question, under the big one: three changes now
          instead of a standing permission. Deliberately not a fourth
          option in the row above, which would read as another permanent
          setting — exactly the commitment people decline to make. */}
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
 * "Try it on three" — a bounded trial that grants nothing. Applies the
 * oldest queued `safe` changes through the normal approve path, changes
 * no setting, and reports what was actually applied.
 */
function TrialOffer({
  waiting,
  oldestDays,
}: {
  waiting: number;
  oldestDays: number | null;
}) {
  const t = useTranslations("dashboard.autonomy.trial");
  // Never promise more than is waiting: with one safe change queued,
  // "the agent applies 3" would be a claim the trial cannot keep.
  const size = Math.min(TRIAL_SIZE, waiting);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<TrialResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const run = () => {
    setState("running");
    setError(null);
    start(async () => {
      try {
        const r = await runTrialAction({ limit: TRIAL_SIZE });
        if (!r.ok) {
          setError(r.error);
          setState("idle");
          return;
        }
        setResult(r.result);
        setState("done");
      } catch (err) {
        setError((err as Error).message);
        setState("idle");
      }
    });
  };

  if (state === "done" && result) {
    return (
      <div className="mx-4 mb-4 rounded-xl border border-border bg-card/40 p-3" role="status">
        <p className="text-xs font-medium">
          {result.applied > 0 ? t("doneTitle") : t("nothingTitle")}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {t(`outcome.${result.outcome}`, {
            attempted: result.attempted,
            applied: result.applied,
            failed: result.failed,
          })}
        </p>
        {result.attempted > 0 && (
          <Link
            href="/agent/autopilot"
            className="mt-1 inline-flex min-h-8 items-center gap-1 text-[11px] font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {t("seeChanges")}
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-4 mb-4 rounded-xl border border-border bg-card/40 p-3">
      <p className="text-xs font-medium">{t("title", { size })}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {oldestDays !== null && oldestDays > 0
          ? t("bodyWithAge", { waiting, days: oldestDays, size })
          : t("body", { waiting, size })}
      </p>
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {state === "running" && <Loader2 className="size-3 animate-spin" aria-hidden />}
        {state === "running" ? t("applying") : t("apply", { size })}
      </button>
      {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
