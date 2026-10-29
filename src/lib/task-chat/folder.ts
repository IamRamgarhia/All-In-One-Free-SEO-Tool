import { existsSync, statSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, tasks } from "@/db/schema";
import type { Workflow } from "./workflow";

export type TaskFolder =
  | { ok: true; dir: string; title: string; workflow: Workflow }
  | { ok: false; error: string; status: number };

/** The task's title and the client's saved project folder, checked to exist. */
export async function resolveTaskFolder(taskId: number): Promise<TaskFolder> {
  const [row] = await db
    .select({
      title: tasks.title,
      localPath: clients.localPath,
      githubRepo: clients.githubRepo,
      baseBranch: clients.baseBranch,
      prMode: clients.prMode,
    })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) return { ok: false, error: "Task not found.", status: 404 };
  if (!row.localPath) {
    return {
      ok: false,
      error: "This client has no Local project folder yet. Set one on the client's Edit page.",
      status: 400,
    };
  }
  let isDir = false;
  try {
    isDir = existsSync(row.localPath) && statSync(row.localPath).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    return {
      ok: false,
      error: `The folder ${row.localPath} does not exist on this machine.`,
      status: 400,
    };
  }
  return {
    ok: true,
    dir: row.localPath,
    title: row.title,
    workflow: {
      githubRepo: row.githubRepo,
      baseBranch: row.baseBranch ?? "main",
      prMode: row.prMode ?? "off",
    },
  };
}

export function firstPrompt(taskId: number): string {
  return (
    `Work on SEO task ${taskId}. Use the seo-tool MCP server: call get_task with taskId ${taskId}, ` +
    `do the work in this folder following the brief, then call update_task to mark it done.`
  );
}
