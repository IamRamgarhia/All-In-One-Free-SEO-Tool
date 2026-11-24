/**
 * "Work done" on a client's page: what was added from the tools and what
 * was finished, newest first, from the client's activity journal.
 *
 * A task closed from a tool writes two lines — the tasks page's own
 * "Task completed" and the tool's "Tool … used on /page: task completed".
 * Shown once, the tool's line, which says more (which tool, which page).
 *
 * Pure: the page reads the rows, this picks what to show.
 */

export const WORK_DONE_KINDS = ["tool.task_added", "tool.task_completed", "tool.fix_checked", "task.completed"] as const;

export type WorkDoneRow = {
  id: number;
  kind: string;
  message: string;
  createdAt: Date;
  entityType: string | null;
  entityId: number | null;
  /** The task's first page, when the line is about a task that still exists. */
  pageUrl: string | null;
};

export function workDoneItems(rows: readonly WorkDoneRow[], limit = 8): WorkDoneRow[] {
  const closedFromTool = new Set(
    rows
      .filter((r) => r.kind === "tool.task_completed" && r.entityType === "task" && r.entityId !== null)
      .map((r) => r.entityId),
  );
  return [...rows]
    .filter((r) => (WORK_DONE_KINDS as readonly string[]).includes(r.kind))
    .filter((r) => !(r.kind === "task.completed" && r.entityType === "task" && closedFromTool.has(r.entityId)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
    .slice(0, limit);
}
