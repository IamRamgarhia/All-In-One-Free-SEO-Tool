/**
 * Hand a generated blog draft to Claude.
 *
 *   POST { itemId }  →  { ok, taskId, sent }
 *
 * The draft is written as a .md file, a task is created for it (once;
 * clicking again reopens the same chat) and the file is attached to that
 * task's chat. Whether anything is sent is the schedule's choice: with
 * "send automatically" on and a prompt written, Claude starts at once
 * with that prompt and the file; otherwise the chat opens with the file
 * attached and waits for you to say what to do.
 *
 * Same rules as the other Claude routes: it works on files of this
 * machine, so only a same-machine request from a signed-in owner passes.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dailySchedules, publishQueue, tasks, taskChats } from "@/db/schema";
import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";
import { buildBlogMarkdown } from "@/lib/blog-export";
import { resolveTaskFolder } from "@/lib/task-chat/folder";
import { writeDraft } from "@/lib/task-chat/drafts";
import { hasAttachment } from "@/lib/task-chat/attachments";
import { isRunning, record, startTurn } from "@/lib/task-chat/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardAdminRequest(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, error: "Opening Claude only works when you use the app on the computer that runs it." },
      { status: 400 },
    );
  }

  let itemId = 0;
  try {
    itemId = Number(((await req.json()) as { itemId?: unknown }).itemId);
  } catch {
    // handled below
  }
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return Response.json({ ok: false, error: "Missing draft id." }, { status: 400 });
  }

  const [item] = await db.select().from(publishQueue).where(eq(publishQueue.id, itemId)).limit(1);
  if (!item || item.kind !== "blog_draft") {
    return Response.json({ ok: false, error: "Blog draft not found." }, { status: 404 });
  }

  // The schedule's current wording wins; an item made before it existed
  // simply has none and opens attach-only.
  let prompt = "";
  let autoSend = false;
  if (item.scheduleId) {
    const [sch] = await db.select().from(dailySchedules).where(eq(dailySchedules.id, item.scheduleId)).limit(1);
    const cfg = (sch?.configJson ?? {}) as Record<string, unknown>;
    if (typeof cfg.claude_prompt === "string") prompt = cfg.claude_prompt.trim();
    autoSend = cfg.claude_auto_send === true && prompt.length > 0;
  }

  const payload = { ...(item.payloadJson ?? {}) } as Record<string, unknown>;
  let taskId = Number(payload.claudeTaskId) || 0;
  if (taskId) {
    const [t] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!t) taskId = 0;
  }
  if (!taskId) {
    const [t] = await db
      .insert(tasks)
      .values({
        clientId: item.clientId,
        title: `Blog draft: ${item.title ?? "untitled"}`,
        description: "A generated blog draft is attached to this chat. Follow the instructions given there.",
        priority: "medium",
      })
      .returning({ id: tasks.id });
    taskId = t.id;
    payload.claudeTaskId = taskId;
    await db.update(publishQueue).set({ payloadJson: payload }).where(eq(publishQueue.id, itemId));
  }

  const folder = await resolveTaskFolder(taskId);
  if (!folder.ok) return Response.json({ ok: false, error: folder.error }, { status: folder.status });

  const file = writeDraft(
    item.clientId,
    item.title,
    buildBlogMarkdown(
      { title: item.title, body: item.body, payload: item.payloadJson, date: item.generatedAt },
      { forAi: !prompt },
    ),
  );

  const [chat] = await db.select().from(taskChats).where(eq(taskChats.taskId, taskId)).limit(1);
  if (!hasAttachment(taskId, file)) {
    record(taskId, { kind: "attachment", data: { name: file.split(/[\/]/).pop(), path: file } });
  }

  // Only a chat that has not started yet is sent to; reopening a finished
  // one must not run the prompt a second time.
  if (autoSend && !chat?.sessionId && !isRunning(taskId)) {
    const started = startTurn(
      taskId,
      folder.dir,
      `Attached file (read it first):\n- ${file}\n\n${prompt}`,
      folder.workflow,
    );
    if (!started.ok) return Response.json({ ok: false, error: started.error }, { status: 500 });
    return Response.json({ ok: true, taskId, sent: true });
  }
  return Response.json({ ok: true, taskId, sent: false });
}
