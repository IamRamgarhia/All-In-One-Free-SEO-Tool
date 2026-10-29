/**
 * The chats the corner dock lists.
 *
 *   GET ?ids=1,2,3  →  { ok: true, chats: [{ taskId, title, client, folder,
 *                                            ready, status, updatedAt }] }
 *
 * The most recently active chats, plus any task ids the dock has open (a
 * task you just opened has no chat row yet). `status` reflects whether a
 * process is really running, so a "running" left behind by a restart
 * shows as idle.
 *
 * Same-machine, signed-in-owner requests only, like the chat itself.
 */

import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, taskChats, tasks } from "@/db/schema";
import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";
import { isRunning } from "@/lib/task-chat/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT = 12;

export async function GET(req: Request) {
  const denied = await guardAdminRequest(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, error: "Only on the computer that runs the app." }, { status: 400 });
  }

  const wanted = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 20);

  const base = () =>
    db
      .select({
        taskId: tasks.id,
        title: tasks.title,
        client: clients.name,
        folder: clients.localPath,
        chatStatus: taskChats.status,
        updatedAt: taskChats.updatedAt,
      })
      .from(tasks)
      .leftJoin(clients, eq(tasks.clientId, clients.id))
      .leftJoin(taskChats, eq(taskChats.taskId, tasks.id));

  const recent = await base()
    .where(isNotNull(taskChats.status))
    .orderBy(desc(taskChats.updatedAt))
    .limit(RECENT);
  const open = wanted.length ? await base().where(inArray(tasks.id, wanted)) : [];

  const seen = new Set<number>();
  const chats = [...open, ...recent]
    .filter((r) => !seen.has(r.taskId) && seen.add(r.taskId))
    .map((r) => ({
      taskId: r.taskId,
      title: r.title,
      client: r.client,
      folder: r.folder,
      ready: Boolean(r.folder),
      status: isRunning(r.taskId) ? "running" : r.chatStatus === "error" ? "error" : "idle",
      updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : 0,
    }));

  return Response.json({ ok: true, chats });
}
