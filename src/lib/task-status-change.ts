import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";
import { logActivity } from "@/lib/activity";

type Recur = "daily" | "weekly" | "monthly" | "quarterly";

function nextDueDate(prev: Date | null, interval: Recur): Date {
  const base = prev ?? new Date();
  const next = new Date(base.getTime());
  if (interval === "daily") next.setDate(next.getDate() + 1);
  else if (interval === "weekly") next.setDate(next.getDate() + 7);
  else if (interval === "monthly") next.setMonth(next.getMonth() + 1);
  else if (interval === "quarterly") next.setMonth(next.getMonth() + 3);
  return next;
}

export type TaskRow = typeof tasks.$inferSelect;

/**
 * Change one task's status, with everything that goes with it: who
 * completed it, the activity entry, and the next instance of a recurring
 * task. Shared by the single and bulk paths — bulk "mark done" used to
 * skip both the activity log and recurrence.
 */
export async function applyTaskStatus(
  existing: TaskRow,
  status: "todo" | "in_progress" | "done" | "skipped",
  completedByUserId: number | null,
): Promise<void> {
  // Record who finished it. Cleared when a task is reopened, so the
  // column always means "who completed the state it's in now" rather
  // than "who touched it once" — /capacity and the monthly report both
  // read it as the former.
  await db
    .update(tasks)
    .set({
      status,
      completedByUserId: status === "done" ? completedByUserId : null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, existing.id));

  if (status !== "done" || existing.status === "done") return;

  await logActivity({
    kind: "task.completed",
    message: `Completed task: ${existing.title}`,
    level: "success",
    clientId: existing.clientId,
    entityType: "task",
    entityId: existing.id,
  });

  if (!existing.recurringInterval) return;

  // Done → reopened → done again used to clone a second next instance
  // each time (easy on the Kanban board). If an open instance of this
  // recurring task already exists, that is the next one.
  const [openInstance] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, existing.clientId),
        eq(tasks.title, existing.title),
        eq(tasks.recurringInterval, existing.recurringInterval),
        inArray(tasks.status, ["todo", "in_progress"]),
        ne(tasks.id, existing.id),
      ),
    )
    .limit(1);
  if (openInstance) return;

  await db.insert(tasks).values({
    clientId: existing.clientId,
    title: existing.title,
    description: existing.description,
    whyItMatters: existing.whyItMatters,
    // These were dropped, so recurring work lost its owner, its estimate
    // and its link to the tool that does it.
    toolPath: existing.toolPath,
    priority: existing.priority,
    status: "todo",
    dueDate: nextDueDate(
      existing.dueDate,
      existing.recurringInterval as Recur,
    ),
    recurringInterval: existing.recurringInterval,
    estimatedMinutes: existing.estimatedMinutes,
    assignedUserId: existing.assignedUserId,
    source: existing.source,
    sourceRef: existing.sourceRef,
  });
}
