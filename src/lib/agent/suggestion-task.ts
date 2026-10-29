/**
 * An AI suggestion as a task Claude can work on.
 *
 * Shared by the "Do it with Claude" button and the autopilot, so both make
 * the same task, and pressing either twice makes only one.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiSuggestions, tasks } from "@/db/schema";

type Suggestion = typeof aiSuggestions.$inferSelect;

const TITLES: Record<string, string> = {
  title_rewrite: "Update page title",
  meta_description_rewrite: "Update meta description",
  h1_rewrite: "Update H1",
  quick_win_action: "Quick win optimization",
  content_idea: "Write new content",
  internal_link: "Add internal link",
  schema_markup: "Add structured data",
  general: "AI suggestion",
};

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** The task for this suggestion, made if it does not exist yet. */
export async function taskForSuggestion(
  s: Suggestion,
): Promise<{ taskId: number; created: boolean }> {
  const sourceRef = `suggestion-${s.id}`;
  const [existing] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.sourceRef, sourceRef))
    .limit(1);
  if (existing) return { taskId: existing.id, created: false };

  // Everything Claude needs to make the change without asking: where, what
  // is there now, and what should be there.
  const description = [
    s.targetUrl ? `Page: ${s.targetUrl}` : null,
    s.currentValue ? `Currently:\n${s.currentValue}` : null,
    `Change to:\n${s.suggestedValue}`,
    "Find where this page's content lives in the project folder and make the change there.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const [row] = await db
    .insert(tasks)
    .values({
      clientId: s.clientId,
      title: `${TITLES[s.type] ?? "AI suggestion"}${s.targetUrl ? ` — ${pathOf(s.targetUrl)}` : ""}`,
      description,
      whyItMatters: s.rationale ?? undefined,
      priority: s.priority,
      status: "todo" as const,
      source: "agent_suggestion",
      sourceRef,
    })
    .returning({ id: tasks.id });
  return { taskId: row.id, created: true };
}
