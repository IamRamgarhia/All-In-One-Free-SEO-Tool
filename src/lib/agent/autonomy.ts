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

/**
 * Has anyone ever actually chosen an autonomy level?
 *
 * Distinct from "is it currently `suggest`", which is what the settings
 * row says whether the user picked it or never saw the question. That
 * distinction is the whole point: the default is deliberately the
 * cautious one, so an install that has never been asked looks exactly
 * like an install that considered autopilot and said no.
 *
 * The consequence was that every hour spent on the fixing half of this
 * product was invisible. The agent found work, proposed it, changed
 * nothing, and the user had no reason to suspect there was a setting
 * that would have changed that.
 *
 * Absence of the row is the signal, so this reports false for an install
 * that predates the flag. Being asked once more is a far smaller cost
 * than never being asked at all.
 */
export async function hasChosenAutonomy(): Promise<boolean> {
  const chosen = await getSetting<boolean>("agent.level_chosen").catch(
    () => null,
  );
  return chosen === true;
}

/**
 * Record the user's answer, and the level they picked with it.
 *
 * Choosing "suggest" still counts as choosing. Someone who reads the
 * options and keeps the cautious one has decided, and asking them again
 * would be nagging rather than informing.
 */
export async function chooseAutonomy(
  level: AutonomyLevel,
): Promise<AgentSettings> {
  const next = await setAgentSettings({ level });
  await setSetting("agent.level_chosen", true);
  return next;
}
