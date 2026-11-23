"use server";

import { actionTx } from "@/lib/action-tx";
import { getReportLocale } from "@/lib/report-i18n";
import { requireSignedIn } from "@/lib/action-guard";

import { requireEditor, requireSettingsAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteSetting, setSetting } from "@/lib/settings-store";
import { sendToWebhook, detectKind } from "@/lib/notifier";

const webhookSchema = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Must be http(s)");

export type WebhookActionResult =
  | { ok: true; message: string; kind?: string }
  | { ok: false; error: string };

export async function saveWebhookUrl(
  _prev: WebhookActionResult | null,
  formData: FormData,
): Promise<WebhookActionResult> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const tx = await actionTx("ui.app_settings_actions");
  const raw = String(formData.get("url") ?? "").trim();

  if (raw === "") {
    await deleteSetting("webhook.url");
    revalidatePath("/settings");
    return { ok: true, message: tx("webhookRemoved") };
  }

  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: tx("enterAValidHttpS") };
  }

  await setSetting("webhook.url", parsed.data);
  revalidatePath("/settings");
  return {
    ok: true,
    message: tx("webhookSaved"),
    kind: detectKind(parsed.data),
  };
}

export async function testWebhook(
  _prev: WebhookActionResult | null,
  formData: FormData,
): Promise<WebhookActionResult> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const tx = await actionTx("ui.app_settings_actions");
  const locale = await getReportLocale();
  const raw = String(formData.get("url") ?? "").trim();

  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: tx("saveAValidWebhookUrl") };
  }

  const result = await sendToWebhook(parsed.data, {
    title: "👋 SEO tool connected",
    body: tx("ifYouSeeThisMessage"),
    level: "info",
    fields: [
      { label: tx("service"), value: detectKind(parsed.data) },
      { label: tx("sentAt"), value: new Date().toLocaleString(locale) },
    ],
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    message: tx("testSentSuccessfullyHttpFormat", { status: result.status, kind: result.kind }),
  };
}

/**
 * Remember which model the AI features should use.
 *
 * An empty string clears it, which falls back to the provider's first
 * preset — the behaviour before this setting existed.
 */
export async function saveDefaultModel(model: string): Promise<void> {
  await requireEditor();
  await requireSignedIn();
  const trimmed = String(model ?? "").trim().slice(0, 120);
  await setSetting("ai.default_model", trimmed);
  revalidatePath("/settings");
}
