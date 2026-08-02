/**
 * Reading and writing the agent's autonomy settings.
 *
 * The vocabulary — level names, the decision rule, the copy — lives in
 * autonomy-levels.ts and is deliberately free of any storage import. The
 * control panel is a client component, and pulling this file into a
 * browser bundle drags better-sqlite3 with it and fails the build.
 */

import { getSetting, setSetting } from "../settings-store";
import { AGENT_DEFAULTS, type AgentSettings, type AutonomyLevel } from "./autonomy-levels";

export {
  AGENT_DEFAULTS,
  LEVEL_DESCRIPTIONS,
  LEVEL_LABELS,
  willAutoApply,
} from "./autonomy-levels";
export type { AgentSettings, AutonomyLevel } from "./autonomy-levels";

export async function getAgentSettings(): Promise<AgentSettings> {
  const raw = await getSetting<Partial<AgentSettings>>("agent.settings");
  if (!raw || typeof raw !== "object") return { ...AGENT_DEFAULTS };
  return {
    level: isLevel(raw.level) ? raw.level : AGENT_DEFAULTS.level,
    maxActionsPerRun: clampInt(
      raw.maxActionsPerRun,
      1,
      100,
      AGENT_DEFAULTS.maxActionsPerRun,
    ),
    maxActionsPerDay: clampInt(
      raw.maxActionsPerDay,
      1,
      500,
      AGENT_DEFAULTS.maxActionsPerDay,
    ),
    cooldownDays: clampInt(raw.cooldownDays, 0, 90, AGENT_DEFAULTS.cooldownDays),
    monthlyAiCapUsd: Number.isFinite(raw.monthlyAiCapUsd)
      ? Math.max(0, Number(raw.monthlyAiCapUsd))
      : AGENT_DEFAULTS.monthlyAiCapUsd,
  };
}

export async function setAgentSettings(
  patch: Partial<AgentSettings>,
): Promise<AgentSettings> {
  const next = { ...(await getAgentSettings()), ...patch };
  await setSetting("agent.settings", next);
  return next;
}

function isLevel(v: unknown): v is AutonomyLevel {
  return v === "off" || v === "suggest" || v === "apply_safe" || v === "apply_all";
}

/**
 * Clamp rather than reject. These are blast-radius limits read on every
 * run; a corrupted or hand-edited settings row must not be able to
 * either crash the agent or hand it an unbounded cap.
 */
function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
