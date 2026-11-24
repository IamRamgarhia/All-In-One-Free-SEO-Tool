/**
 * Works through a client's open tasks one after another, highest priority
 * first, each in its own Claude Code conversation. Started only by an
 * owner or a manager pressing "Start" for that client (api/task-queue).
 *
 * Nothing is closed when a task finishes: its chat stays on the task's
 * page with everything Claude did, and the next task gets a chat of its
 * own. A task is tried once per run, so one that Claude does not finish
 * cannot loop forever. Three failures in a row (Claude missing, signed
 * out, no network) stop the run instead of burning through the list.
 *
 * With "one pull request per run", every task is committed on one
 * seo/batch-… branch and the app pushes it and opens a single pull
 * request when the run ends (lib/task-chat/batch).
 *
 * The queue lives in memory. A restart ends the run; the tasks keep their
 * chats, and starting again picks up the tasks that are still open.
 *
 * Ported from the original author's queue (a9d65df, 2afc0a7), without the
 * autopilot's "only these tasks" and "continue with next".
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";
import { closeBatch, batchBranchName, type BatchOutcome, type BatchRun } from "./batch";
import { resolveTaskFolder, type FolderBlock } from "./folder";
import { usableWorkflow } from "./workflow";
import { setTurnEndHook, startTurn, stopTurn, type TurnEnd } from "./runner";

/** How the run ended; the page words it (clientCode.queue.notes). */
export type QueueNote =
  | { code: "all_done" | "stopped" | "three_failures" }
  | { code: "blocked"; reason: FolderBlock };

export type QueueState = {
  clientId: number;
  locale: string;
  active: boolean;
  startedAt: number;
  /** Open tasks when the run began, for "3 of 12". */
  total: number;
  current: number | null;
  attempted: number[];
  failed: number[];
  note: QueueNote | null;
  /** Set for a "one pull request per run" client: where the run's commits go. */
  batch?: BatchRun;
  /** Filled in once the run's pull request has been made (or not). */
  batchOutcome?: BatchOutcome | "pending";
};

type Store = { queues: Map<number, QueueState> };
const g = globalThis as unknown as { __taskQueue?: Store };
const store: Store = (g.__taskQueue ??= { queues: new Map() });

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const MAX_FAILURES_IN_A_ROW = 3;

export function queueFor(clientId: number): QueueState | null {
  return store.queues.get(clientId) ?? null;
}

async function openTasks(clientId: number) {
  const rows = await db
    .select({ id: tasks.id, priority: tasks.priority, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.clientId, clientId), inArray(tasks.status, ["todo", "in_progress"])));
  return rows.sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) ||
      (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) ||
      a.id - b.id,
  );
}

/** The run is over. For a one-pull-request run, the branch is pushed and the pull request opened here. */
function end(q: QueueState, note: QueueNote) {
  q.active = false;
  q.current = null;
  q.note = note;
  const batch = q.batch;
  if (!batch) return;
  q.batchOutcome = "pending";
  const attempted = [...q.attempted];
  void (async () => {
    const rows = attempted.length
      ? await db
          .select({ id: tasks.id, title: tasks.title, status: tasks.status })
          .from(tasks)
          .where(inArray(tasks.id, attempted))
      : [];
    q.batchOutcome = await closeBatch(
      batch,
      rows.map((r) => ({ id: r.id, title: r.title, done: r.status === "done" })),
    );
  })();
}

async function advance(q: QueueState) {
  if (!q.active) return;
  const next = (await openTasks(q.clientId)).find((t) => !q.attempted.includes(t.id));
  if (!next) {
    end(q, { code: "all_done" });
    return;
  }
  const folder = await resolveTaskFolder(next.id, q.locale);
  if (!folder.ok) {
    end(q, { code: "blocked", reason: folder.code });
    return;
  }
  q.attempted.push(next.id);
  q.current = next.id;
  const workflow = q.batch ? { ...folder.workflow, batchBranch: q.batch.branch } : folder.workflow;
  const started = startTurn(next.id, { clientId: folder.clientId, dir: folder.dir, workflow }, folder.prompt, q.locale);
  if (!started.ok) {
    q.failed.push(next.id);
    q.current = null;
    if (started.code === "switched_off") {
      end(q, { code: "blocked", reason: "client_off" });
      return;
    }
    // Something else is running on that task; do not wait on it.
    await advance(q);
  }
}

function owner(taskId: number): QueueState | undefined {
  for (const q of store.queues.values()) if (q.active && q.current === taskId) return q;
  return undefined;
}

setTurnEndHook((taskId: number, how: TurnEnd) => {
  const q = owner(taskId);
  if (!q) return;
  q.current = null;
  if (how === "stopped") {
    end(q, { code: "stopped" });
    return;
  }
  if (how === "error") {
    q.failed.push(taskId);
    const tail = q.attempted.slice(-MAX_FAILURES_IN_A_ROW);
    if (tail.length === MAX_FAILURES_IN_A_ROW && tail.every((id) => q.failed.includes(id))) {
      end(q, { code: "three_failures" });
      return;
    }
  }
  void advance(q);
});

export type StartQueueResult =
  | { ok: true; first: number | null }
  | { ok: false; code: "already_running" | "no_open_tasks" | FolderBlock };

export async function startQueue(clientId: number, locale: string): Promise<StartQueueResult> {
  const existing = store.queues.get(clientId);
  if (existing?.active) return { ok: false, code: "already_running" };
  const open = await openTasks(clientId);
  if (open.length === 0) return { ok: false, code: "no_open_tasks" };
  const folder = await resolveTaskFolder(open[0].id, locale);
  if (!folder.ok) return { ok: false, code: folder.code };

  const q: QueueState = {
    clientId,
    locale,
    active: true,
    startedAt: Date.now(),
    total: open.length,
    current: null,
    attempted: [],
    failed: [],
    note: null,
  };
  const wf = usableWorkflow(folder.workflow);
  if (wf && wf.prMode === "pr_batch") {
    q.batch = { clientId, dir: folder.dir, repo: wf.githubRepo, base: wf.baseBranch, branch: batchBranchName() };
  }
  store.queues.set(clientId, q);
  await advance(q);
  return { ok: true, first: q.current };
}

export function stopQueue(clientId: number): boolean {
  const q = store.queues.get(clientId);
  if (!q?.active) return false;
  const current = q.current;
  end(q, { code: "stopped" });
  if (current !== null) stopTurn(current);
  return true;
}
