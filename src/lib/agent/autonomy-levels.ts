/**
 * The autonomy vocabulary — types, the decision rule, and the copy the
 * user reads when choosing how much rope to give the agent.
 *
 * Split from autonomy.ts because that file reads and writes settings,
 * which reaches the database, which is better-sqlite3 — a native module
 * that cannot exist in a browser bundle. The control panel is a client
 * component and needs the labels and the level names; importing them
 * from the same file as the persistence broke the build outright.
 *
 * Nothing here touches storage. Anything that does belongs next door.
 */

export type AutonomyLevel =
  /** Analyse and propose. Never writes to a live site. The default. */
  | "suggest"
  /**
   * Apply changes whose correctness is measurable — a title over 60
   * characters is too long by a rule, not an opinion — and queue
   * everything else for approval.
   */
  | "apply_safe"
  /** Apply everything the agent proposes. For users who trust it. */
  | "apply_all"
  /** Do nothing at all, not even analysis. */
  | "off";

export type AgentSettings = {
  level: AutonomyLevel;
  /**
   * Most changes the agent may make to one client in a single run.
   *
   * A blast-radius limit, not a performance one. If the agent has
   * misjudged something, this is the difference between fixing five
   * pages wrongly and fixing four hundred pages wrongly — and between
   * an annoyed user and a lost client.
   */
  maxActionsPerRun: number;
  /** Most changes per client per day, across all runs. */
  maxActionsPerDay: number;
  /**
   * Don't touch the same page+kind again for this many days.
   *
   * Without a cooldown the agent rewrites a title, re-reads the page,
   * decides the new title could also be better, and rewrites it again —
   * each edit individually defensible, the sequence indefensible.
   */
  cooldownDays: number;
  /** Pause everything if the month's AI spend passes this. 0 = no cap. */
  monthlyAiCapUsd: number;
};

export const AGENT_DEFAULTS: AgentSettings = {
  // Deliberately not the most autonomous option, even though autonomy is
  // the point. These changes land on a client's live website — one the
  // user is accountable for to someone else. Full autonomy is one
  // setting away, and they turn it on when they trust it. That is a
  // better sequence than turning it on for them and hoping.
  level: "suggest",
  maxActionsPerRun: 5,
  maxActionsPerDay: 20,
  cooldownDays: 7,
  monthlyAiCapUsd: 0,
};

/** Would this level act on an action of this risk, without asking? */
export function willAutoApply(
  level: AutonomyLevel,
  risk: "safe" | "needs_review",
): boolean {
  if (level === "apply_all") return true;
  if (level === "apply_safe") return risk === "safe";
  return false;
}

export const LEVEL_LABELS: Record<AutonomyLevel, string> = {
  off: "Off",
  suggest: "Suggest only",
  apply_safe: "Fix the obvious things",
  apply_all: "Full autopilot",
};

export const LEVEL_DESCRIPTIONS: Record<AutonomyLevel, string> = {
  off: "The agent doesn't run. Nothing is analysed, nothing is proposed.",
  suggest:
    "Analyses your sites every day and proposes fixes, but never changes anything. You apply what you agree with.",
  apply_safe:
    "Fixes things that are wrong by a measurable rule — titles too long to display, missing alt text, missing meta descriptions — and queues judgement calls for you. Every change is logged with its previous value and can be undone in one click.",
  apply_all:
    "Applies everything it proposes, including rewrites that are a matter of judgement. Still logged, still reversible, but you'll be reviewing after the fact rather than before.",
};
