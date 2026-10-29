/**
 * The chat with Claude Code for one task.
 *
 *   GET    ?after=<event id>  server-sent events: everything stored after
 *                             that id, then live updates until the page
 *                             goes away
 *   POST   { message? }       send a message (the first one may be empty:
 *                             the task brief prompt is used)
 *   DELETE                    stop the run in progress
 *
 * Claude runs on this machine, in the client's project folder, with files
 * and commands it can touch, so every method refuses anything that is not
 * a same-machine request from a signed-in owner. The browser sends a task
 * id and some text; the folder comes from the client record.
 */

import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { taskChatEvents, taskChats } from "@/db/schema";
import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";
import { firstPrompt, resolveTaskFolder } from "@/lib/task-chat/folder";
import { withAttachments } from "@/lib/task-chat/attachments";
import { isRunning, reconcile, startTurn, stopTurn, subscribe, type LiveMessage } from "@/lib/task-chat/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE = 20_000;

type Ctx = { params: Promise<{ taskId: string }> };

async function gate(req: Request, ctx: Ctx): Promise<{ taskId: number } | Response> {
  const denied = await guardAdminRequest(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, error: "Claude chat only works when you use the app on the computer that runs it." },
      { status: 400 },
    );
  }
  const taskId = Number((await ctx.params).taskId);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return Response.json({ ok: false, error: "Bad task id." }, { status: 400 });
  }
  return { taskId };
}

export async function GET(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx);
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
  const g = await gate(req, ctx);
  if (g instanceof Response) return g;
  const { taskId } = g;

  let message = "";
  try {
    const body = (await req.json()) as { message?: unknown };
    if (typeof body.message === "string") message = body.message.trim().slice(0, MAX_MESSAGE);
  } catch {
    // an empty body is fine for the first message
  }

  const folder = await resolveTaskFolder(taskId);
  if (!folder.ok) return Response.json({ ok: false, error: folder.error }, { status: folder.status });

  if (isRunning(taskId)) {
    return Response.json({ ok: false, error: "Claude is already working on this task." }, { status: 409 });
  }
  if (!message) {
    const [chat] = db.select().from(taskChats).where(eq(taskChats.taskId, taskId)).all();
    if (chat?.sessionId) {
      return Response.json({ ok: false, error: "Write a message first." }, { status: 400 });
    }
    message = firstPrompt(taskId);
  }

  const started = startTurn(taskId, folder.dir, withAttachments(taskId, message), folder.workflow);
  if (!started.ok) return Response.json({ ok: false, error: started.error }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx);
  if (g instanceof Response) return g;
  return Response.json({ ok: true, stopped: stopTurn(g.taskId) });
}
