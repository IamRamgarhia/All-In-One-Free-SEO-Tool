"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { automations, type AutomationAction } from "@/db/schema";

const triggerEnum = z.enum([
  "audit_completed",
  "audit_failed",
  "score_drop",
  "page_change",
  "rank_drop",
]);

const inputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  trigger: triggerEnum,
  clientId: z.coerce.number().int().positive().optional().or(
    z
      .literal("")
      .transform(() => undefined)
      .or(z.literal("0").transform(() => undefined)),
  ),
  actionKind: z.enum(["webhook", "create_task", "log"]),
  webhookUrl: z.string().trim().optional(),
  taskTitle: z.string().trim().optional(),
  taskPriority: z.enum(["high", "medium", "low"]).optional(),
  logMessage: z.string().trim().optional(),
});

export type SaveAutomationResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function createAutomation(
  _prev: SaveAutomationResult | null,
  formData: FormData,
): Promise<SaveAutomationResult> {
  const parsed = inputSchema.safeParse({
    name: formData.get("name"),
    trigger: formData.get("trigger"),
    clientId: formData.get("clientId") || undefined,
    actionKind: formData.get("actionKind"),
    webhookUrl: formData.get("webhookUrl") ?? undefined,
    taskTitle: formData.get("taskTitle") ?? undefined,
    taskPriority: formData.get("taskPriority") ?? undefined,
    logMessage: formData.get("logMessage") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  let action: AutomationAction;
  if (parsed.data.actionKind === "webhook") {
    if (!parsed.data.webhookUrl) {
      return { ok: false, error: "Webhook URL required." };
    }
    if (!/^https?:\/\//i.test(parsed.data.webhookUrl)) {
      return { ok: false, error: "Webhook URL must be http(s)." };
    }
    action = { kind: "webhook", url: parsed.data.webhookUrl };
  } else if (parsed.data.actionKind === "create_task") {
    if (!parsed.data.taskTitle) {
      return { ok: false, error: "Task title required." };
    }
    action = {
      kind: "create_task",
      title: parsed.data.taskTitle,
      priority: parsed.data.taskPriority ?? "medium",
    };
  } else {
    if (!parsed.data.logMessage) {
      return { ok: false, error: "Log message required." };
    }
    action = { kind: "log", message: parsed.data.logMessage };
  }

  const [row] = await db
    .insert(automations)
    .values({
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      clientId: parsed.data.clientId ?? null,
      actions: [action],
      enabled: true,
    })
    .returning({ id: automations.id });

  revalidatePath("/automations");
  return { ok: true, id: row.id };
}

export async function setAutomationEnabled(id: number, enabled: boolean) {
  if (!Number.isFinite(id) || id <= 0) return;
  await db
    .update(automations)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(automations.id, id));
  revalidatePath("/automations");
}

export async function deleteAutomation(id: number) {
  if (!Number.isFinite(id) || id <= 0) return;
  await db.delete(automations).where(eq(automations.id, id));
  revalidatePath("/automations");
}
