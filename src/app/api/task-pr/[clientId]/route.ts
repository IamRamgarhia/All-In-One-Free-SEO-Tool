/**
 * The pull requests Claude Code opened for a client's tasks.
 *
 *   GET    the open ones (branches seo/task-<id>-… or seo/batch-…), with
 *          their check state
 *   POST   { number }  merge one          { all: true }  merge every ready one
 *
 * The page asks for a confirmation before either POST. Merging changes the
 * client's repository, so: owners and managers only, the client's switch
 * on, from this machine, through the `gh` sign-in already on it (the app
 * never sees a token). The repo and base branch come from the client.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { guardClientCodeRequest } from "@/lib/code-agent-access";
import { listTaskPrs, mergeAllReady, mergeTaskPr } from "@/lib/task-chat/pull-requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ clientId: string }> };

async function gate(req: Request, ctx: Ctx): Promise<{ repo: string; base: string } | Response> {
  const clientId = Number((await ctx.params).clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return Response.json({ ok: false, code: "not_found" }, { status: 400 });
  }
  const denied = await guardClientCodeRequest(req, clientId, { host: true });
  if (denied) return denied;
  const [c] = await db
    .select({ repo: clients.githubRepo, base: clients.baseBranch })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!c?.repo) return Response.json({ ok: false, code: "no_repo" }, { status: 400 });
  return { repo: c.repo, base: c.base || "main" };
}

export async function GET(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx);
  if (g instanceof Response) return g;
  const r = await listTaskPrs(g.repo);
  return Response.json(r, { status: r.ok ? 200 : 502 });
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await gate(req, ctx);
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => ({}))) as { number?: unknown; all?: unknown };
  if (body.all === true) {
    const r = await mergeAllReady(g.repo, g.base);
    return Response.json(r, { status: r.ok ? 200 : 502 });
  }
  const number = Number(body.number);
  if (!Number.isInteger(number) || number <= 0) {
    return Response.json({ ok: false, code: "bad_request" }, { status: 400 });
  }
  const r = await mergeTaskPr(g.repo, number, g.base);
  return Response.json({ ok: r.ok, results: [r] }, { status: r.ok ? 200 : 400 });
}
