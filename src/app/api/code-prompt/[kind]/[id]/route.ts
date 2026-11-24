/**
 * The manual path: the prompt for fixing a client's site with any coding
 * assistant (VS Code, a terminal), no program run on this machine.
 *
 *   GET /api/code-prompt/task/<id>             the task's prompt, as text
 *   GET /api/code-prompt/audit/<id>            a whole audit's prompt: the
 *                                              instructions plus the same
 *                                              report as "Export LLM"
 *   …?download=1                               the same, as a .md file
 *
 * Owners and managers, on a client they may see (lib/code-agent-access).
 * Works whether or not Claude Code is switched on or installed.
 */

import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db/client";
import { audits, clients, tasks } from "@/db/schema";
import { renderLlmReport, type AuditResult } from "@/audit";
import { guardClientCodeRequest } from "@/lib/code-agent-access";
import { taskTitle } from "@/lib/issue-display";
import { buildAuditPrompt, buildTaskPrompt, promptFileName, type PromptClient } from "@/lib/task-prompt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ kind: string; id: string }> };

function promptClient(c: typeof clients.$inferSelect): PromptClient {
  return {
    name: c.name,
    url: c.url,
    techStack: c.techStack,
    localPath: c.localPath,
    githubRepo: c.githubRepo,
    baseBranch: c.baseBranch,
  };
}

function answer(req: Request, kind: "task" | "audit", id: number, text: string): Response {
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(text, {
    headers: {
      "Content-Type": download ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": `attachment; filename="${promptFileName(kind, id)}"` } : {}),
    },
  });
}

const notFound = () => Response.json({ ok: false, code: "not_found" }, { status: 404 });

export async function GET(req: Request, ctx: Ctx) {
  const { kind, id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0 || (kind !== "task" && kind !== "audit")) return notFound();
  const locale = await getLocale();

  if (kind === "task") {
    const [row] = await db
      .select({ task: tasks, client: clients })
      .from(tasks)
      .innerJoin(clients, eq(tasks.clientId, clients.id))
      .where(eq(tasks.id, id))
      .limit(1);
    if (!row) return notFound();
    const denied = await guardClientCodeRequest(req, row.client.id);
    if (denied) return denied;
    const text = buildTaskPrompt({
      task: { ...row.task, title: taskTitle(row.task.title, locale) },
      client: promptClient(row.client),
      locale,
    });
    return answer(req, "task", id, text);
  }

  const [row] = await db
    .select({ raw: audits.rawReport, targetUrl: audits.targetUrl, client: clients })
    .from(audits)
    .innerJoin(clients, eq(audits.clientId, clients.id))
    .where(eq(audits.id, id))
    .limit(1);
  if (!row) return notFound();
  const denied = await guardClientCodeRequest(req, row.client.id);
  if (denied) return denied;
  // Same source as the audit page's "Export LLM": the engine's stored result.
  const raw = row.raw as AuditResult | null | undefined;
  if (!raw || !Array.isArray(raw.categoryResults)) {
    return Response.json({ ok: false, code: "no_report" }, { status: 404 });
  }
  const text = buildAuditPrompt({
    url: row.targetUrl || row.client.url,
    client: promptClient(row.client),
    report: renderLlmReport(raw),
    locale,
  });
  return answer(req, "audit", id, text);
}
