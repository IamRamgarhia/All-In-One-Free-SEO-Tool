"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { clients, tasks } from "@/db/schema";

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

export async function setTaskStatus(
  taskId: number,
  status: "todo" | "in_progress" | "done" | "skipped",
) {
  if (!Number.isFinite(taskId) || taskId <= 0) return;

  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!existing) return;

  await db
    .update(tasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  // If a recurring task was just marked done, clone the next instance.
  if (
    status === "done" &&
    existing.recurringInterval &&
    existing.status !== "done"
  ) {
    const nextDue = nextDueDate(
      existing.dueDate,
      existing.recurringInterval as Recur,
    );
    await db.insert(tasks).values({
      clientId: existing.clientId,
      title: existing.title,
      description: existing.description,
      whyItMatters: existing.whyItMatters,
      priority: existing.priority,
      status: "todo",
      dueDate: nextDue,
      recurringInterval: existing.recurringInterval,
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function deleteTask(taskId: number) {
  if (!Number.isFinite(taskId) || taskId <= 0) return;
  await db.delete(tasks).where(eq(tasks.id, taskId));
  revalidatePath("/tasks");
  revalidatePath("/");
}

const newTaskSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  title: z.string().trim().min(2).max(200),
  whyItMatters: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  dueInDays: z.coerce.number().int().min(0).max(365).optional(),
  recurringInterval: z
    .enum(["daily", "weekly", "monthly", "quarterly"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type CreateTaskResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function createTask(
  _prev: CreateTaskResult | null,
  formData: FormData,
): Promise<CreateTaskResult> {
  const raw = {
    clientId: formData.get("clientId"),
    title: formData.get("title"),
    whyItMatters: formData.get("whyItMatters") ?? undefined,
    priority: formData.get("priority") ?? "medium",
    dueInDays: formData.get("dueInDays") ?? undefined,
    recurringInterval:
      formData.get("recurringInterval") === ""
        ? undefined
        : (formData.get("recurringInterval") ?? undefined),
  };
  const parsed = newTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, parsed.data.clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found." };

  const dueDate =
    typeof parsed.data.dueInDays === "number"
      ? new Date(Date.now() + parsed.data.dueInDays * 86_400_000)
      : null;

  const [row] = await db
    .insert(tasks)
    .values({
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      whyItMatters: parsed.data.whyItMatters,
      priority: parsed.data.priority,
      status: "todo",
      dueDate,
      recurringInterval: parsed.data.recurringInterval,
    })
    .returning({ id: tasks.id });

  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true, id: row.id };
}

export async function setTaskRecurrence(
  taskId: number,
  recurringInterval:
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | null,
) {
  if (!Number.isFinite(taskId) || taskId <= 0) return;
  await db
    .update(tasks)
    .set({ recurringInterval, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  revalidatePath("/tasks");
}

// Bulk operations
import { inArray } from "drizzle-orm";

function validIds(ids: number[]): number[] {
  return ids.filter((id) => Number.isFinite(id) && id > 0);
}

export async function bulkSetTaskStatus(
  ids: number[],
  status: "todo" | "in_progress" | "done" | "skipped",
) {
  const valid = validIds(ids);
  if (valid.length === 0) return;
  await db
    .update(tasks)
    .set({ status, updatedAt: new Date() })
    .where(inArray(tasks.id, valid));
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function bulkSetTaskPriority(
  ids: number[],
  priority: "high" | "medium" | "low",
) {
  const valid = validIds(ids);
  if (valid.length === 0) return;
  await db
    .update(tasks)
    .set({ priority, updatedAt: new Date() })
    .where(inArray(tasks.id, valid));
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function bulkDeleteTasks(ids: number[]) {
  const valid = validIds(ids);
  if (valid.length === 0) return;
  await db.delete(tasks).where(inArray(tasks.id, valid));
  revalidatePath("/tasks");
  revalidatePath("/");
}
