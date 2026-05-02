"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { aiSuggestions, tasks } from "@/db/schema";
import { runSeoAgent, type AgentRunResult } from "@/lib/seo-agent";

export async function runAgent(clientId: number): Promise<AgentRunResult> {
  const result = await runSeoAgent(clientId);
  revalidatePath(`/agent/c/${clientId}`);
  return result;
}

export async function applySuggestion(suggestionId: number) {
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

  revalidatePath(`/agent/c/${s.clientId}`);
}

export async function dismissSuggestion(suggestionId: number) {
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

  revalidatePath(`/agent/c/${s.clientId}`);
}

export async function reopenSuggestion(suggestionId: number) {
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

  revalidatePath(`/agent/c/${s.clientId}`);
}

/**
 * Promote a suggestion into a real task on the client's task list — useful
 * when the user wants to track applying it as work-in-progress.
 */
export async function suggestionToTask(suggestionId: number) {
  const [s] = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestionId))
    .limit(1);
  if (!s) return;

  const titleByType: Record<string, string> = {
    title_rewrite: "Update page title",
    meta_description_rewrite: "Update meta description",
    h1_rewrite: "Update H1",
    quick_win_action: "Quick win optimization",
    content_idea: "Write new content",
    internal_link: "Add internal link",
    schema_markup: "Add structured data",
    general: "AI suggestion",
  };

  await db.insert(tasks).values({
    clientId: s.clientId,
    title: `${titleByType[s.type] ?? "AI suggestion"}${s.targetUrl ? ` — ${new URL(s.targetUrl).pathname}` : ""}`,
    description: s.suggestedValue,
    whyItMatters: s.rationale ?? undefined,
    priority: s.priority,
    status: "todo" as const,
  });

  await db
    .update(aiSuggestions)
    .set({ status: "applied", updatedAt: new Date() })
    .where(eq(aiSuggestions.id, suggestionId));

  revalidatePath(`/agent/c/${s.clientId}`);
  revalidatePath(`/clients/${s.clientId}`);
  revalidatePath("/tasks");
}
