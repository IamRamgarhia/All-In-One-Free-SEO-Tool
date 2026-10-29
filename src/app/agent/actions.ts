"use server";

import { eq } from "drizzle-orm";
import { safeRevalidatePath } from "@/lib/safe-revalidate";
import { db } from "@/db/client";
import { aiSuggestions } from "@/db/schema";
import { taskForSuggestion } from "@/lib/agent/suggestion-task";
import { runSeoAgent, type AgentRunResult } from "@/lib/seo-agent";
import {
  runAgentActions,
  type AgentRunReport,
} from "@/lib/seo-agent-runner";
import { guardAction } from "@/lib/action-guard";

export async function runAgent(clientId: number): Promise<AgentRunResult> {
  await guardAction("edit", clientId);
  const result = await runSeoAgent(clientId);
  safeRevalidatePath(`/agent/c/${clientId}`);
  return result;
}

export async function runAgentExecute(
  clientId: number,
): Promise<AgentRunReport> {
  await guardAction("edit", clientId);
  const report = await runAgentActions(clientId);
  safeRevalidatePath(`/agent/c/${clientId}`);
  safeRevalidatePath(`/clients/${clientId}`);
  safeRevalidatePath("/tasks");
  return report;
}

export async function applySuggestion(suggestionId: number) {
  await guardAction("edit");
  const [s] = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestionId))
    .limit(1);
  if (!s) return;

  await db
    .update(aiSuggestions)
    .set({ status: "applied", updatedAt: new Date() })
    .where(eq(aiSuggestions.id, suggestionId));

  safeRevalidatePath(`/agent/c/${s.clientId}`);
}

export async function dismissSuggestion(suggestionId: number) {
  await guardAction("edit");
  const [s] = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestionId))
    .limit(1);
  if (!s) return;

  await db
    .update(aiSuggestions)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(eq(aiSuggestions.id, suggestionId));

  safeRevalidatePath(`/agent/c/${s.clientId}`);
}

export async function reopenSuggestion(suggestionId: number) {
  await guardAction("edit");
  const [s] = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestionId))
    .limit(1);
  if (!s) return;

  await db
    .update(aiSuggestions)
    .set({ status: "new", updatedAt: new Date() })
    .where(eq(aiSuggestions.id, suggestionId));

  safeRevalidatePath(`/agent/c/${s.clientId}`);
}

/**
 * Promote a suggestion into a real task on the client's task list — useful
 * when the user wants to track applying it as work-in-progress.
 */
export async function suggestionToTask(suggestionId: number): Promise<{ taskId: number } | null> {
  await guardAction("edit");
  const [s] = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestionId))
    .limit(1);
  if (!s) return null;

  // Pressing it twice (or "Do it with Claude" after "Add to tasks") must
  // not make a second task for the same suggestion.
  const { taskId } = await taskForSuggestion(s);

  await db
    .update(aiSuggestions)
    .set({ status: "applied", updatedAt: new Date() })
    .where(eq(aiSuggestions.id, suggestionId));

  safeRevalidatePath(`/agent/c/${s.clientId}`);
  safeRevalidatePath(`/clients/${s.clientId}`);
  safeRevalidatePath("/tasks");
  return { taskId };
}
