"use client";

import { useEffect, useState } from "react";

const MODELS = [
  ["default", "Claude's default"],
  ["fable", "Fable"],
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
] as const;

const EFFORTS = [
  ["default", "default"],
  ["low", "low"],
  ["medium", "medium"],
  ["high", "high"],
  ["xhigh", "xhigh"],
  ["max", "max"],
] as const;

type Choice = { model: string; effort: string };

const SELECT =
  "rounded border border-zinc-800 bg-[#111114] px-1 py-0.5 text-[11px] text-zinc-300 outline-none hover:border-zinc-600 focus:border-[#d97757]/70 disabled:opacity-50 [&_option]:bg-[#111114] [&_option]:text-zinc-200";

/**
 * Model and effort for the Claude chats. Saved for the whole workspace and
 * used from the next message on; a turn already running keeps its own.
 */
export function ModelPicker() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/task-chat-settings")
      .then((r) => r.json())
      .then((j: { ok: boolean } & Choice) => {
        if (live && j.ok) setChoice({ model: j.model, effort: j.effort });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!choice) return null;

  async function change(patch: Partial<Choice>) {
    const next = { ...choice!, ...patch };
    setChoice(next);
    setBusy(true);
    try {
      await fetch("/api/task-chat-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    } catch {
      // the choice stays on screen; the next change tries again
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-1" title="Applies from the next message">
      <select
        value={choice.model}
        disabled={busy}
        onChange={(e) => void change({ model: e.target.value })}
        className={SELECT}
        aria-label="Claude model"
      >
        {MODELS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select
        value={choice.effort}
        disabled={busy}
        onChange={(e) => void change({ effort: e.target.value })}
        className={SELECT}
        aria-label="Effort level"
      >
        {EFFORTS.map(([v, l]) => (
          <option key={v} value={v}>
            effort: {l}
          </option>
        ))}
      </select>
    </span>
  );
}
