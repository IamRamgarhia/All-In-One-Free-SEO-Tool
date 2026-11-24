/**
 * Run a client's open tasks through Claude Code, highest priority first.
 *
 *   POST    start the queue
 *   DELETE  stop it (and the task Claude is on)
 *
 * Owners and managers only, the client's switch on, from this machine
 * (lib/code-agent-access). Nothing starts without this click.
 */

import { getLocale } from "next-intl/server";
import { guardClientCodeRequest } from "@/lib/code-agent-access";
import { startQueue, stopQueue } from "@/lib/task-chat/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ clientId: string }> };

async function gate(req: Request, ctx: Ctx): Promise<{ clientId: number } | Response> {
  const clientId = Number((await ctx.params).clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return Response.json({ ok: false, code: "not_found" }, { status: 400 });
  }
  const denied = await guardClientCodeRequest(req, clientId, { host: true });
  if (denied) return denied;
  return { clientId };
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx);
  if (g instanceof Response) return g;
  const r = await startQueue(g.clientId, await getLocale());
  return Response.json(r, { status: r.ok ? 200 : 400 });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx);
  if (g instanceof Response) return g;
  return Response.json({ ok: true, stopped: stopQueue(g.clientId) });
}
