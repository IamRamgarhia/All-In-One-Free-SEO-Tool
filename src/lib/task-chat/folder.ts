import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, tasks } from "@/db/schema";
import { codeAgentStateFor, type CodeAgentBlock } from "@/lib/host-agent";
import { taskTitle } from "@/lib/issue-display";
import { buildTaskPrompt } from "@/lib/task-prompt";
import { documentsRoot, isInside } from "./documents";
import type { Workflow } from "./workflow";

/** Why a task cannot go to Claude Code; each code has its sentence in messages (clientCode.reasons). */
export type FolderBlock =
  | CodeAgentBlock
  | "task_not_found"
  | "no_folder"
  | "folder_missing"
  | "folder_not_absolute"
  | "folder_holds_documents";

export type TaskFolder =
  | { ok: true; clientId: number; dir: string; title: string; workflow: Workflow; prompt: string }
  | { ok: false; code: FolderBlock; status: number };

/**
 * Everything a Claude Code turn needs for a task, checked: the client's
 * switch, its saved project folder (absolute, existing, not holding the
 * app's own documents folder), the pull-request settings and the prompt.
 */
export async function resolveTaskFolder(taskId: number, locale: string): Promise<TaskFolder> {
  const [row] = await db
    .select({ task: tasks, client: clients })
    .from(tasks)
    .innerJoin(clients, eq(tasks.clientId, clients.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) return { ok: false, code: "task_not_found", status: 404 };
  const { task, client } = row;

  const state = codeAgentStateFor(client);
  if (!state.enabled) return { ok: false, code: state.reason, status: 403 };

  const dir = client.localPath?.trim();
  if (!dir) return { ok: false, code: "no_folder", status: 400 };
  if (!path.isAbsolute(dir)) return { ok: false, code: "folder_not_absolute", status: 400 };
  let isDir = false;
  try {
    isDir = existsSync(dir) && statSync(dir).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) return { ok: false, code: "folder_missing", status: 400 };
  if (isInside(dir, documentsRoot())) return { ok: false, code: "folder_holds_documents", status: 400 };

  const title = taskTitle(task.title, locale);
  return {
    ok: true,
    clientId: client.id,
    dir,
    title,
    workflow: {
      githubRepo: client.githubRepo,
      baseBranch: client.baseBranch ?? "main",
      prMode: client.prMode ?? "off",
    },
    prompt: buildTaskPrompt({
      task: { ...task, title },
      client: {
        name: client.name,
        url: client.url,
        techStack: client.techStack,
        localPath: dir,
        githubRepo: client.prMode !== "off" ? client.githubRepo : null,
        baseBranch: client.baseBranch,
      },
      locale,
    }),
  };
}
