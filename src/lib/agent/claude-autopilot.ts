/**
 * The autopilot, with Claude Code doing the work.
 *
 * For a client whose site lives in a local project folder (and maybe a
 * GitHub repo), changes are not written through a plugin: the autopilot
 * turns what it found into tasks and hands the chosen ones to the task
 * queue, where Claude works them one by one in that folder. Every step
 * shows up in the Claude dock, and the PR mode set on the client decides
 * whether it edits files, opens pull requests, or merges them.
 *
 *   Fix the obvious things — only changes that are right by a rule:
 *     title / meta description / H1 rewrites and the plain "missing"
 *     findings (meta description, title, alt text, canonical, social tags,
 *     schema).
 *   Full autopilot — every open task of the client.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { agentRuns, aiSuggestions, tasks, type Client } from "@/db/schema";
import { startQueue } from "@/lib/task-chat/queue";
import type { AgentSettings, AutonomyLevel } from "./autonomy-levels";
import { taskForSuggestion } from "./suggestion-task";

export type Engine = "wordpress" | "claude" | "none";

/** Suggestions that are measurable enough to apply without asking. */
const SAFE_SUGGESTIONS = new Set(["title_rewrite", "meta_description_rewrite", "h1_rewrite"]);

/** Audit findings whose fix is a plain "add the missing thing". */
const SAFE_FINDINGS = new Set([
  "missing_meta_description",
  "missing_title",
  "missing_image_alt",
  "missing_canonical",
  "missing_og_tags",
  "missing_twitter_card",
  "missing_schema",
]);

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Who works on this client: the site's plugin, Claude in a folder, or nobody. */
export function pickEngine(
  c: Pick<Client, "autopilotEngine" | "wpEndpoint" | "wpKey" | "localPath">,
): Engine {
  const wp = Boolean(c.wpEndpoint && c.wpKey);
  const folder = Boolean(c.localPath);
  if (c.autopilotEngine === "wordpress") return wp ? "wordpress" : "none";
  if (c.autopilotEngine === "claude") return folder ? "claude" : "none";
  if (wp) return "wordpress";
  return folder ? "claude" : "none";
}

/** The level that applies to this client: its own, else the workspace's. */
export function levelFor(c: Pick<Client, "autopilotLevel">, workspace: AutonomyLevel): AutonomyLevel {
  return c.autopilotLevel ?? workspace;
}

export type ClaudeRun = {
  runId: number;
  planned: number;
  summary: string;
  /** The task Claude opened with, so the page can show it. */
  openTaskId: number | null;
  ok: boolean;
};

export async function runClaudeAutopilot(opts: {
  client: Client;
  level: Extract<AutonomyLevel, "apply_safe" | "apply_all">;
  settings: AgentSettings;
  trigger: "scheduled" | "manual";
}): Promise<ClaudeRun> {
  const { client, level, settings, trigger } = opts;
  const full = level === "apply_all";

  const [run] = await db
    .insert(agentRuns)
    .values({ clientId: client.id, mode: level, trigger, startedAt: new Date() })
    .returning({ id: agentRuns.id });

  const finish = async (planned: number, summary: string, openTaskId: number | null, ok: boolean) => {
    await db
      .update(agentRuns)
      .set({ finishedAt: new Date(), planned, queued: planned, summary, error: ok ? null : summary })
      .where(eq(agentRuns.id, run.id));
    return { runId: run.id, planned, summary, openTaskId, ok };
  };

  try {
    // 1. New AI suggestions become tasks (once each).
    const fresh = await db
      .select()
      .from(aiSuggestions)
      .where(and(eq(aiSuggestions.clientId, client.id), eq(aiSuggestions.status, "new")));
    const kind = new Map<number, string>();
    for (const s of fresh) {
      if (!full && !(SAFE_SUGGESTIONS.has(s.type) && s.targetUrl)) continue;
      const { taskId } = await taskForSuggestion(s);
      kind.set(taskId, s.type);
      await db
        .update(aiSuggestions)
        .set({ status: "applied", updatedAt: new Date() })
        .where(eq(aiSuggestions.id, s.id));
    }

    // 2. Pick what Claude is to work on.
    const open = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.clientId, client.id), inArray(tasks.status, ["todo", "in_progress"])));

    const wanted = open.filter((t) => {
      if (full) return true;
      if (kind.has(t.id)) return true;
      if (t.source === "agent_suggestion") return false; // an older, unrelated suggestion
      if (t.source === "agent" && t.sourceRef?.startsWith("agent:")) {
        return SAFE_FINDINGS.has(t.sourceRef.slice("agent:".length));
      }
      return false;
    });

    wanted.sort(
      (a, b) =>
        (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || a.id - b.id,
    );
    // The scheduled run keeps to the blast-radius limit the WordPress path
    // obeys. "Run now" is someone asking for the work to be done, so it
    // takes everything that is there.
    const limit = trigger === "manual" ? wanted.length : settings.maxActionsPerRun;
    const chosen = wanted.slice(0, limit).map((t) => t.id);

    if (chosen.length === 0) {
      return finish(0, `Nothing for Claude to do on ${client.name}.`, null, true);
    }

    // 3. Hand them to the queue; Claude works them in the dock.
    const started = await startQueue(client.id, chosen);
    if (!started.ok) {
      return finish(chosen.length, `Could not start Claude on ${client.name}: ${started.error}`, null, false);
    }
    const rest = wanted.length - chosen.length;
    return finish(
      chosen.length,
      `Claude is working ${chosen.length} task${chosen.length === 1 ? "" : "s"} on ${client.name}` +
        (rest > 0 ? ` (${rest} more wait for the next run)` : "") +
        ".",
      started.first,
      true,
    );
  } catch (err) {
    return finish(0, `The run failed: ${(err as Error).message}`, null, false);
  }
}
