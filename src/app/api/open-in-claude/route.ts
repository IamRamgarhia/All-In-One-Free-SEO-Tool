/**
 * Start Claude Code in a client's project folder, already pointed at one
 * task.
 *
 *   POST { taskId }  →  { ok, launched, command }
 *
 * `launched` is true when a terminal window was opened on this machine
 * (Windows only for now). Otherwise `command` is returned so the page can
 * copy it for the person to paste into a terminal of their own.
 *
 * Nothing the client sends is run. The caller supplies a task id; the
 * folder comes from the client's saved "Local project folder" and the
 * prompt is built here from that number alone. Both travel to the new
 * terminal in environment variables, never spliced into a command line.
 * Like the folder picker, it opens a window on the machine running the
 * server, so it refuses anything that is not a same-machine request.
 */

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, tasks } from "@/db/schema";
import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function promptFor(taskId: number): string {
  return (
    `Work on SEO task ${taskId}. Use the seo-tool MCP server: call get_task with taskId ${taskId}, ` +
    `do the work in this folder following the brief, then call update_task to mark it done.`
  );
}

export async function POST(req: Request) {
  const denied = await guardAdminRequest(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;

  if (!isLocalRequest(req)) {
    return Response.json(
      {
        ok: false,
        error:
          "Opening Claude only works when you use the app on the computer that runs it.",
      },
      { status: 400 },
    );
  }

  let taskId = 0;
  try {
    const body = (await req.json()) as { taskId?: unknown };
    taskId = Number(body.taskId);
  } catch {
    // falls through to the check below
  }
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return Response.json({ ok: false, error: "Missing task id." }, { status: 400 });
  }

  const [row] = await db
    .select({ clientId: tasks.clientId, localPath: clients.localPath })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) {
    return Response.json({ ok: false, error: "Task not found." }, { status: 404 });
  }
  if (!row.localPath) {
    return Response.json(
      {
        ok: false,
        error:
          "This client has no Local project folder yet. Set one on the client's Edit page.",
      },
      { status: 400 },
    );
  }
  const dir = row.localPath;
  let isDir = false;
  try {
    isDir = existsSync(dir) && statSync(dir).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    return Response.json(
      { ok: false, error: `The folder ${dir} does not exist on this machine.` },
      { status: 400 },
    );
  }

  const prompt = promptFor(taskId);
  const command = `cd "${dir}"; claude "${prompt}"`;

  if (process.platform !== "win32") {
    return Response.json({ ok: true, launched: false, command });
  }

  try {
    // `start` opens a new console window; -NoExit keeps it open after
    // Claude ends. The folder and prompt are read from the environment.
    const child = spawn(
      "cmd.exe",
      [
        "/c",
        "start",
        '""',
        "powershell.exe",
        "-NoExit",
        "-Command",
        "Set-Location -LiteralPath $env:SEO_TASK_DIR; claude $env:SEO_TASK_PROMPT",
      ],
      {
        env: { ...process.env, SEO_TASK_DIR: dir, SEO_TASK_PROMPT: prompt },
        detached: true,
        stdio: "ignore",
        windowsVerbatimArguments: true,
      },
    );
    child.unref();
    return Response.json({ ok: true, launched: true, command });
  } catch {
    return Response.json({ ok: true, launched: false, command });
  }
}
