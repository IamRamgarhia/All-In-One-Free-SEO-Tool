/**
 * The Claude Code chat for one task.
 *
 *   GET    ?after=<event id>  server-sent events: everything stored after
 *                             that id, then live updates until the page
 *                             goes away (reading only; no program runs)
 *   POST   { message? }       send a message (the first one may be empty:
 *                             the task's prompt is sent, the same text as
 *                             "Copy the prompt")
 *   DELETE                    stop the run in progress
 *
 * POST and DELETE run or stop a program on this machine, in the client's
 * project folder: owners and managers only, the client's switch on, and a
 * request from this machine (lib/code-agent-access). The browser sends a
 * task id and some text; the folder comes from the client record.
 */

import { and, eq, gt } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db/client";
import { taskChatEvents, taskChats, tasks } from "@/db/schema";
import { guardClientCodeRequest } from "@/lib/code-agent-access";
import { resolveTaskFolder } from "@/lib/task-chat/folder";
import { isRunning, reconcile, startTurn, stopTurn, subscribe, type LiveMessage } from "@/lib/task-chat/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE = 20_000;

type Ctx = { params: Promise<{ taskId: string }> };

async function gate(req: Request, ctx: Ctx, host: boolean): Promise<{ taskId: number } | Response> {
  const taskId = Number((await ctx.params).taskId);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return Response.json({ ok: false, code: "task_not_found" }, { status: 400 });
  }
  const [task] = await db.select({ clientId: tasks.clientId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return Response.json({ ok: false, code: "task_not_found" }, { status: 404 });
  const denied = await guardClientCodeRequest(req, task.clientId, { host });
  if (denied) return denied;
  return { taskId };
}

export async function GET(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx, false);
  if (g instanceof Response) return g;
  const { taskId } = g;

  const url = new URL(req.url);
  // EventSource sends Last-Event-ID itself when it reconnects.
  const after = Math.max(
    0,
    Number(url.searchParams.get("after")) || 0,
    Number(req.headers.get("last-event-id")) || 0,
  );
  const enc = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown, id?: number) => {
        if (closed) return;
        try {
          controller.enqueue(
            enc.encode(`${id !== undefined ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      reconcile(taskId);

      // Subscribe before reading the backlog so nothing recorded in
      // between is lost; ids de-duplicate the overlap.
      let lastId = after;
      let replaying = true;
      const queued: LiveMessage[] = [];
      const deliver = (m: LiveMessage) => {
        if (m.type === "status") return send("status", { status: m.status });
        if (m.id <= lastId) return;
        lastId = m.id;
        send("chat", { id: m.id, kind: m.kind, data: m.data }, m.id);
      };
      const unsubscribe = subscribe(taskId, (m) => (replaying ? queued.push(m) : deliver(m)));

      const rows = db
        .select()
        .from(taskChatEvents)
        .where(and(eq(taskChatEvents.taskId, taskId), gt(taskChatEvents.id, after)))
        .orderBy(taskChatEvents.id)
        .all();
      for (const r of rows) {
        lastId = r.id;
        send("chat", { id: r.id, kind: r.kind, data: r.data, at: r.createdAt.getTime() }, r.id);
      }
      const [chat] = db.select().from(taskChats).where(eq(taskChats.taskId, taskId)).all();
      send("status", { status: chat?.status ?? "idle" });
      replaying = false;
      for (const m of queued) deliver(m);

      const beat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(": keep-alive\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);

      cleanup = () => {
        closed = true;
        clearInterval(beat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", () => cleanup?.());
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx, true);
  if (g instanceof Response) return g;
  const { taskId } = g;

  let message = "";
  try {
    const body = (await req.json()) as { message?: unknown };
    if (typeof body.message === "string") message = body.message.trim().slice(0, MAX_MESSAGE);
  } catch {
    // an empty body is fine for the first message
  }

  const locale = await getLocale();
  const folder = await resolveTaskFolder(taskId, locale);
  if (!folder.ok) return Response.json({ ok: false, code: folder.code }, { status: folder.status });

  if (isRunning(taskId)) return Response.json({ ok: false, code: "busy" }, { status: 409 });
  if (!message) {
    const [chat] = db.select().from(taskChats).where(eq(taskChats.taskId, taskId)).all();
    if (chat?.sessionId) return Response.json({ ok: false, code: "empty_message" }, { status: 400 });
    message = folder.prompt;
  }

  const started = startTurn(taskId, { clientId: folder.clientId, dir: folder.dir, workflow: folder.workflow }, message, locale);
  if (!started.ok) return Response.json({ ok: false, code: started.code }, { status: 409 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx, true);
  if (g instanceof Response) return g;
  return Response.json({ ok: true, stopped: stopTurn(g.taskId) });
}
