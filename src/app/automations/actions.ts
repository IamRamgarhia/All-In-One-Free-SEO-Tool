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

export async function testWebhook(url: string): Promise<
  | { ok: true; status: number }
  | { ok: false; error: string }
> {
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "Webhook URL must start with http(s)://" };
  }
  const payload = {
    text: "🔔 Test alert from your SEO tool — webhook is wired correctly.",
    event: "test",
    triggeredAt: new Date().toISOString(),
  };
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8_000);
    const res = await fetch(url, {
      method: "POST",
      signal: c.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    clearTimeout(t);
    if (!res.ok) {
      return { ok: false, error: `Webhook returned ${res.status}.` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network failure",
    };
  }
}

import { workflowTemplates } from "@/lib/workflow-templates";

export async function installWorkflowTemplate(input: {
  templateId: string;
  clientId?: number | null;
  webhookUrl?: string;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const tmpl = workflowTemplates.find((t) => t.id === input.templateId);
  if (!tmpl) return { ok: false, error: "Unknown template" };

  const action: AutomationAction =
    tmpl.action.kind === "webhook"
      ? input.webhookUrl && /^https?:\/\//i.test(input.webhookUrl)
        ? { kind: "webhook", url: input.webhookUrl }
        : (() => {
            throw new Error("BAD_WEBHOOK");
          })()
      : tmpl.action.kind === "create_task"
        ? {
            kind: "create_task",
            title: tmpl.action.title,
            priority: tmpl.action.priority,
          }
        : { kind: "log", message: tmpl.action.message };

  try {
    const [row] = await db
      .insert(automations)
      .values({
        name: tmpl.name,
        trigger: tmpl.trigger,
        clientId: input.clientId ?? null,
        actions: [action],
        enabled: true,
      })
      .returning({ id: automations.id });
    revalidatePath("/automations");
    return { ok: true, id: row.id };
  } catch (e) {
    if (e instanceof Error && e.message === "BAD_WEBHOOK") {
      return {
        ok: false,
        error: "This template needs a Slack/Discord webhook URL.",
      };
    }
    return { ok: false, error: "Couldn't install template." };
  }
}
