/**
 * The pull requests Claude opened for a client's tasks.
 *
 *   GET    the open ones, with their check state
 *   POST   { number }  merge one          { all: true }  merge every ready one
 *
 * Merging changes the client's repository, so it is limited to a
 * same-machine request from a signed-in owner, and only to branches named
 * seo/task-<id>-… . The repo and base branch come from the client record.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";
import { listTaskPrs, mergeAllReady, mergeTaskPr } from "@/lib/task-chat/pull-requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ clientId: string }> };

async function gate(req: Request, ctx: Ctx): Promise<{ repo: string; base: string } | Response> {
  const denied = await guardAdminRequest(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, error: "Pull requests can only be managed from the computer that runs the app." },
      { status: 400 },
    );
  }
  const clientId = Number((await ctx.params).clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return Response.json({ ok: false, error: "Bad client id." }, { status: 400 });
  }
  const [c] = await db
    .select({ repo: clients.githubRepo, base: clients.baseBranch })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!c?.repo) {
    return Response.json({ ok: false, error: "This client has no GitHub repository." }, { status: 400 });
  }
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
    return Response.json({ ok: false, error: "Say which pull request." }, { status: 400 });
  }
  const r = await mergeTaskPr(g.repo, number, g.base);
  return Response.json({ ok: r.ok, results: [r] }, { status: r.ok ? 200 : 400 });
}
