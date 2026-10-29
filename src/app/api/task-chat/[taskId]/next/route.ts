/**
 * "Continue with next": from a finished task's chat, have Claude go on
 * with the client's other open tasks.
 *
 *   POST   returns { ok, next } where next is the task Claude is now on
 *
 * Same rules as the chat route: only a same-machine request from a
 * signed-in owner.
 */

import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";
import { continueWithNext } from "@/lib/task-chat/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ taskId: string }> };

export async function POST(req: Request, ctx: Ctx) {
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
  const r = await continueWithNext(taskId);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
