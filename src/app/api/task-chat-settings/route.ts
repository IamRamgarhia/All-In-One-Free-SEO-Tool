/**
 * Which model and effort the Claude Code chats use.
 *
 *   GET   the current choice
 *   PUT   { model?, effort? } change it (applies from the next turn)
 *
 * Same rules as the chat route: only a same-machine request from a
 * signed-in owner.
 */

import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";
import { readChatModel, saveChatModel } from "@/lib/task-chat/model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(req: Request): Promise<Response | null> {
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
  return null;
}

export async function GET(req: Request) {
  const denied = await gate(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;
  return Response.json({ ok: true, ...readChatModel() });
}

export async function PUT(req: Request) {
  const denied = await gate(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;
  const body = (await req.json().catch(() => ({}))) as { model?: unknown; effort?: unknown };
  const current = readChatModel();
  const saved = saveChatModel({
    model: body.model ?? current.model,
    effort: body.effort ?? current.effort,
  });
  return Response.json({ ok: true, ...saved });
}
