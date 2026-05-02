import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceSettings } from "@/db/schema";

export type SettingKey =
  | "webhook.url"
  | "webhook.notify_on_audit_complete"
  | "webhook.notify_on_score_drop"
  | "webhook.score_drop_threshold"
  | "brand.name"
  | "brand.logo_data_url"
  | "brand.color"
  | "ui.mode"
  | "api.openai"
  | "api.anthropic"
  | "api.gemini"
  | "api.perplexity"
  | "api.openrouter"
  | "api.groq"
  | "api.ollama_url"
  | "ai.active_provider"
  // Google OAuth — user supplies their own Cloud OAuth client (free, ~5 min).
  // Tokens stored encrypted-at-rest at the SQLite layer (the file lives on
  // their machine; this is a single-user local-first app).
  | "google.client_id"
  | "google.client_secret"
  | "google.refresh_token"
  | "google.access_token"
  | "google.access_token_expires_at"
  | "google.connected_email"
  // SMTP for outbound report email. Stored per-instance; the user enters
  // their own SMTP credentials (Gmail app password, SendGrid, Resend SMTP,
  // a Hetzner mail box — anything that speaks SMTP).
  | "smtp.host"
  | "smtp.port"
  | "smtp.user"
  | "smtp.password"
  | "smtp.from_email"
  | "smtp.from_name"
  | "smtp.secure"
  | "schedule_runner.last_run"
  | "api.pagespeed";

export async function getSetting<T = unknown>(
  key: SettingKey,
): Promise<T | null> {
  const [row] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.key, key))
    .limit(1);
  return (row?.value as T | undefined) ?? null;
}

export async function setSetting(
  key: SettingKey,
  value: unknown,
): Promise<void> {
  await db
    .insert(workspaceSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: workspaceSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function deleteSetting(key: SettingKey): Promise<void> {
  await db.delete(workspaceSettings).where(eq(workspaceSettings.key, key));
}
