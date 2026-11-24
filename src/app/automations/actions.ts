"use server";

import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";
import { guardedFetch } from "@/lib/url-guard";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { automations, type AutomationAction, type AutomationSchedule } from "@/db/schema";
import { requireClientAccess, requireEditor } from "@/lib/auth";

const triggerEnum = z.enum([
  "audit_completed",
  "audit_failed",
  "score_drop",
  "page_change",
  "rank_drop",
  "schedule",
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
  actionKind: z.enum(["webhook", "create_task", "log", "ai_step"]),
  aiPrompt: z.string().trim().max(4000).optional(),
  deliverable: z.enum(["task", "note", "webhook", "log"]).optional(),
  every: z.enum(["daily", "weekly", "monthly"]).optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(),
  day: z.coerce.number().int().min(1).max(28).optional(),
  tz: z.string().trim().max(64).optional(),
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
  await requireSignedIn();
  const tx = await actionTx("ui.app_automations_actions");
  const parsed = inputSchema.safeParse({
    name: formData.get("name"),
    trigger: formData.get("trigger"),
    clientId: formData.get("clientId") || undefined,
    actionKind: formData.get("actionKind"),
    webhookUrl: formData.get("webhookUrl") ?? undefined,
    taskTitle: formData.get("taskTitle") ?? undefined,
    taskPriority: formData.get("taskPriority") ?? undefined,
    logMessage: formData.get("logMessage") ?? undefined,
    aiPrompt: formData.get("aiPrompt") ?? undefined,
    deliverable: formData.get("deliverable") ?? undefined,
    every: formData.get("every") ?? undefined,
    hour: formData.get("hour") ?? undefined,
    day: formData.get("day") || undefined,
    tz: formData.get("tz") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? tx("invalidInput"),
    };
  }

  let action: AutomationAction;
  if (parsed.data.actionKind === "webhook") {
    if (!parsed.data.webhookUrl) {
      return { ok: false, error: tx("webhookUrlRequired") };
    }
    if (!/^https?:\/\//i.test(parsed.data.webhookUrl)) {
      return { ok: false, error: tx("webhookUrlMustBeHttp") };
    }
    action = { kind: "webhook", url: parsed.data.webhookUrl };
  } else if (parsed.data.actionKind === "create_task") {
    if (!parsed.data.taskTitle) {
      return { ok: false, error: tx("taskTitleRequired") };
    }
    action = {
      kind: "create_task",
      title: parsed.data.taskTitle,
      priority: parsed.data.taskPriority ?? "medium",
    };
  } else if (parsed.data.actionKind === "ai_step") {
    if (!parsed.data.aiPrompt || parsed.data.aiPrompt.length < 10) {
      return { ok: false, error: tx("aiPromptRequired") };
    }
    const deliverable = parsed.data.deliverable ?? "task";
    if (deliverable === "webhook" && !/^https?:\/\//i.test(parsed.data.webhookUrl ?? "")) {
      return { ok: false, error: tx("webhookUrlMustBeHttp") };
    }
    action = {
      kind: "ai_step",
      prompt: parsed.data.aiPrompt,
      deliverable,
      ...(deliverable === "webhook" ? { webhookUrl: parsed.data.webhookUrl } : {}),
    };
  } else {
    if (!parsed.data.logMessage) {
      return { ok: false, error: tx("logMessageRequired") };
    }
    action = { kind: "log", message: parsed.data.logMessage };
  }

  let schedule: AutomationSchedule | null = null;
  let nextRunAt: Date | null = null;
  if (parsed.data.trigger === "schedule") {
    // A schedule only makes sense with something to do on its own: the AI step.
    if (action.kind !== "ai_step") return { ok: false, error: tx("scheduleNeedsAiStep") };
    const { nextRunAfter, validTimeZone } = await import("@/lib/ai-automations");
    const tz = parsed.data.tz && validTimeZone(parsed.data.tz) ? parsed.data.tz : "Europe/Paris";
    const every = parsed.data.every ?? "weekly";
    schedule = {
      every,
      hour: parsed.data.hour ?? 8,
      ...(every === "daily" ? {} : { day: parsed.data.day ?? 1 }),
      tz,
    };
    nextRunAt = nextRunAfter(schedule, new Date());
  }

  const [row] = await db
    .insert(automations)
    .values({
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      clientId: parsed.data.clientId ?? null,
      actions: [action],
      enabled: true,
      schedule,
      nextRunAt,
    })
    .returning({ id: automations.id });

  revalidatePath("/automations");
  return { ok: true, id: row.id };
}

/** "Lancer maintenant": the AI step of one automation, for testing it. */
export async function runAutomationNow(
  id: number,
): Promise<{ ok: true; runs: number; failed: number } | { ok: false; error: string }> {
  await requireEditor();
  await requireSignedIn();
  const tx = await actionTx("ui.app_automations_actions");
  const [a] = await db.select().from(automations).where(eq(automations.id, Number(id))).limit(1);
  if (!a) return { ok: false, error: tx("automationNotFound") };
  if (a.clientId !== null) await requireClientAccess(a.clientId, { edit: true });
  const { runAutomationAiSteps } = await import("@/lib/ai-automations");
  const r = await runAutomationAiSteps(a, "manual");
  await db
    .update(automations)
    .set({ lastRunAt: new Date(), runCount: (a.runCount ?? 0) + 1 })
    .where(eq(automations.id, a.id));
  revalidatePath("/automations");
  return { ok: true, ...r };
}

export async function setAutomationEnabled(id: number, enabled: boolean) {
  await requireSignedIn();
  if (!Number.isFinite(id) || id <= 0) return;
  await db
    .update(automations)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(automations.id, id));
  revalidatePath("/automations");
}

export async function deleteAutomation(id: number) {
  await requireSignedIn();
  if (!Number.isFinite(id) || id <= 0) return;
  await db.delete(automations).where(eq(automations.id, id));
  revalidatePath("/automations");
}

export async function testWebhook(url: string): Promise<
  | { ok: true; status: number }
  | { ok: false; error: string }
> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_automations_actions");
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: tx("webhookUrlMustStartWith") };
  }
  const payload = {
    text: "🔔 Test alert from rank_forge — webhook is wired correctly.",
    event: "test",
    triggeredAt: new Date().toISOString(),
  };
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8_000);
    // guardedFetch refuses private and loopback hosts on every redirect hop.
    const res = await guardedFetch(url, {
      method: "POST",
      signal: c.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    clearTimeout(t);
    if (!res.ok) {
      return { ok: false, error: tx("webhookReturned", { status: res.status }) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : tx("networkFailure"),
    };
  }
}

import { workflowTemplates } from "@/lib/workflow-templates";
import { WORKFLOW_TEMPLATES_FR } from "@/lib/workflow-templates.fr";
import { getReportLocale } from "@/lib/report-i18n";

export async function installWorkflowTemplate(input: {
  templateId: string;
  clientId?: number | null;
  webhookUrl?: string;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_automations_actions");
  const tmpl = workflowTemplates.find((t) => t.id === input.templateId);
  if (!tmpl) return { ok: false, error: tx("unknownTemplate") };
  // Stored text (name, task title, log line) in the workspace language.
  const fr = (await getReportLocale()) === "fr" ? WORKFLOW_TEMPLATES_FR[tmpl.id] : undefined;

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
            title: fr?.title ?? tmpl.action.title,
            priority: tmpl.action.priority,
          }
        : { kind: "log", message: fr?.message ?? tmpl.action.message };

  try {
    const [row] = await db
      .insert(automations)
      .values({
        name: fr?.name ?? tmpl.name,
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
        error: tx("thisTemplateNeedsASlack"),
      };
    }
    return { ok: false, error: tx("couldnTInstallTemplate") };
  }
}
