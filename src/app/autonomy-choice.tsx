"use client";

import { useState, useTransition } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import { LEVEL_DESCRIPTIONS, type AutonomyLevel } from "@/lib/agent/autonomy-levels";
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

export function AutonomyChoice({ current }: { current: AutonomyLevel }) {
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
            It currently finds work every night and changes nothing, because
            nobody has answered this yet. Every change it makes is logged with
            the previous value and can be undone in one click. You can change
            this any time in agent settings.
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

      {error && (
        <p className="px-5 pb-4 text-xs text-destructive">{error}</p>
      )}
    </section>
  );
}
