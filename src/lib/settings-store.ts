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
  // Extended brand fields — surfaced on PDFs (invoice, report cover),
  // email digests (weekly digest header / footer), and the client
  // portal share page. Optional; tool falls back gracefully when any
  // field is empty.
  | "brand.tagline"
  | "brand.website"
  | "brand.email"
  | "brand.phone"
  | "brand.footer_text"
  | "ui.mode"
  | "api.openai"
  | "api.anthropic"
  | "api.gemini"
  | "api.perplexity"
  | "api.openrouter"
  | "api.groq"
  | "api.mistral"
  | "api.deepseek"
  | "api.cerebras"
  | "api.together"
  | "api.github"
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
  | "page_monitor_runner.last_run"
  | "daily_agent_runner.last_run"
  | "news_runner.last_run"
  | "news_runner.last_seen_at"
  | "seen.news.last_seen_at"
  | "seen.suggestions.last_seen_at"
  | "seen.page_changes.last_seen_at"
  | "seen.activity.last_seen_at"
  | "alerts.thresholds"
  | "mention_digest_runner.last_run"
  | "playbook_monitor_runner.last_run"
  | "lost_link_runner.last_run"
  | "outreach_reply_poll.last_run"
  | "anomaly_runner.last_run"
  | "title_test_runner.last_run"
  | "google.gmail_scope_ok"
  | "google.gmail_scope_checked_at"
  | "api.pagespeed"
  // Credit-saver mode: cap maxTokens, force terse system prompt, lower temp.
  // ON keeps token use under ~500/answer for cheap providers like Gemini /
  // Groq free tiers. OFF gives full-quality long-form answers (defaults OFF).
  | "ai.credit_saver.enabled"
  | "outreach.sender_name"
  | "indexnow.key"
  | "bing.api_key"
  | "youtube.api_key"
  // Browser pool — controls headless chromium concurrency + outbound proxies.
  // proxies is a newline-separated list of "http://user:pass@host:port" or
  // "host:port"; rotated round-robin per launched context. Empty = direct.
  | "browser.max_concurrency"
  | "browser.proxies"
  | "browser.stealth_enabled"
  // Remote browser endpoint. When set, all withBrowserContext calls use
  // chromium.connect(<this WS endpoint>) instead of launching local
  // Chrome. Lets self-hosters on tiny VPSes offload browser work to a
  // managed service (Browserless, Cloudflare Browser Rendering, etc.).
  | "browser.remote_ws"
  // Lean-mode toggles — disable specific browser-dependent tools to
  // free RAM on small boxes. Tool pages still render but show a
  // "disabled in lean mode" notice and a link back to Settings.
  | "browser.disable_rank_check"
  | "browser.disable_local_cwv"
  | "browser.disable_serp_scan"
  | "browser.disable_gbp_scraper"
  // Cookie jar for logged-in scraping. Stored as JSON array of
  // { domain, name, value, path?, expires?, secure?, httpOnly? }.
  | "browser.cookies"
  // Monthly USD cap for AI calls. When set, calls past the cap return null
  // (with a "cap reached" error), so a runaway workflow can't drain credits.
  | "ai.monthly_cap_usd"
  // Per-day brand list used by branded-vs-non-branded GSC splitter.
  | "brand.match_terms"
  // Weekly digest settings
  | "digest.recipient_email"
  | "digest.auto_send_enabled"
  | "digest.last_sent_at"
  | "digest.last_auto_run_at";

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
