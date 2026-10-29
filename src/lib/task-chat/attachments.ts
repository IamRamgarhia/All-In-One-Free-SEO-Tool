import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { taskChatEvents, taskChats } from "@/db/schema";

/**
 * Files attached to a chat but not yet sent. They ride along with the
 * first message: Claude is told where they are and reads them itself.
 * After a thread has started they are already in its context.
 */
export function withAttachments(taskId: number, message: string): string {
  const [chat] = db.select().from(taskChats).where(eq(taskChats.taskId, taskId)).all();
  if (chat?.sessionId) return message;
  const files = db
    .select()
    .from(taskChatEvents)
    .where(and(eq(taskChatEvents.taskId, taskId), eq(taskChatEvents.kind, "attachment")))
    .all()
    .map((r) => String(r.data.path ?? ""))
    .filter(Boolean);
  if (files.length === 0) return message;
  return `Attached file${files.length > 1 ? "s" : ""} (read ${files.length > 1 ? "them" : "it"} first):\n${files
    .map((f) => `- ${f}`)
    .join("\n")}\n\n${message}`;
}

export function hasAttachment(taskId: number, path: string): boolean {
  return db
    .select()
    .from(taskChatEvents)
    .where(and(eq(taskChatEvents.taskId, taskId), eq(taskChatEvents.kind, "attachment")))
    .all()
    .some((r) => r.data.path === path);
}
