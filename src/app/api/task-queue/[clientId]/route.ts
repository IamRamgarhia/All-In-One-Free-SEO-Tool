/**
 * Run a client's open tasks through Claude, highest priority first.
 *
 *   POST    start the queue
 *   DELETE  stop it (and the task Claude is on)
 *
 * Same rules as the chat route: Claude edits files on this machine, so
 * only a same-machine request from a signed-in owner gets through.
 */

import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";
import { startQueue, stopQueue } from "@/lib/task-chat/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ clientId: string }> };

async function gate(req: Request, ctx: Ctx): Promise<{ clientId: number } | Response> {
  const denied = await guardAdminRequest(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, error: "The task queue only works when you use the app on the computer that runs it." },
      { status: 400 },
    );
  }
  const clientId = Number((await ctx.params).clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return Response.json({ ok: false, error: "Bad client id." }, { status: 400 });
  }
  return { clientId };
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx);
  if (g instanceof Response) return g;
  const r = await startQueue(g.clientId);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx);
  if (g instanceof Response) return g;
  return Response.json({ ok: true, stopped: stopQueue(g.clientId) });
}
