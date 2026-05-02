import { eq, or, isNull, and } from "drizzle-orm";
import { db } from "@/db/client";
import { automations, tasks, type AutomationAction } from "@/db/schema";
import { sendToWebhook } from "./notifier";
import { logActivity } from "./activity";

export type AutomationTrigger =
  | "audit_completed"
  | "audit_failed"
  | "score_drop"
  | "page_change"
  | "rank_drop";

export type TriggerPayload = {
  clientId: number | null;
  clientName: string | null;
  // free-form fields used by webhook + task templating
  data: Record<string, string | number | null | undefined>;
};

/**
 * Look up automations matching this trigger + client, evaluate actions,
 * update run-count. Best-effort — never throws into the caller.
 */
export async function runAutomations(
  trigger: AutomationTrigger,
  payload: TriggerPayload,
): Promise<void> {
  try {
    const matching = await db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.trigger, trigger),
          eq(automations.enabled, true),
          payload.clientId !== null
            ? or(
                isNull(automations.clientId),
                eq(automations.clientId, payload.clientId),
              )
            : isNull(automations.clientId),
        ),
      );

    for (const automation of matching) {
      for (const action of automation.actions) {
        await runAction(action, payload, automation.id, trigger).catch(() => {});
      }
      await db
        .update(automations)
        .set({
          lastRunAt: new Date(),
          runCount: (automation.runCount ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(automations.id, automation.id));
    }
  } catch {
    // Swallow — never let automation execution break the main flow
  }
}

function interpolate(template: string, data: TriggerPayload["data"]): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

async function runAction(
  action: AutomationAction,
  payload: TriggerPayload,
  automationId: number,
  trigger: AutomationTrigger,
): Promise<void> {
  if (action.kind === "webhook") {
    await sendToWebhook(action.url, {
      title: `Automation fired: ${trigger}`,
      body: `Client: ${payload.clientName ?? "—"}`,
      level: "info",
      fields: Object.entries(payload.data).map(([k, v]) => ({
        label: k,
        value: String(v ?? ""),
      })),
    });
    return;
  }

  if (action.kind === "create_task") {
    if (payload.clientId === null) return; // can't create a task without a client
    await db.insert(tasks).values({
      clientId: payload.clientId,
      title: interpolate(action.title, payload.data),
      whyItMatters: action.whyItMatters
        ? interpolate(action.whyItMatters, payload.data)
        : null,
      priority: action.priority,
      status: "todo",
    });
    return;
  }

  if (action.kind === "log") {
    await logActivity({
      kind: "audit.completed", // generic info kind
      message: `Automation #${automationId}: ${interpolate(action.message, payload.data)}`,
      clientId: payload.clientId,
    });
    return;
  }
}
