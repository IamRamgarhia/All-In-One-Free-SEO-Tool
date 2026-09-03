import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceSettings } from "@/db/schema";

export type SettingKey =
  /**
   * Per-runner scheduler bookkeeping: `scheduler.<runner_id>.started_at`,
   * `.finished_at`, `.last_error`. Open-ended because the runner list
   * lives in scheduler.ts and shouldn't require editing this union every
   * time a background job is added — the prefix keeps it namespaced.
   */
  | `scheduler.${string}`
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
  /** "light" | "dark" | "system" — defaults to "system". */
  | "ui.theme"
  /** Autonomy level and guardrails for the agent. See lib/agent/autonomy.ts. */
  | "agent.settings"
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
  // How the user supplies AI: "none" | "mcp" | "api" | "both". Drives which
  // badge each tool shows and whether the tools grid filters itself. This
  // records what they *told* us; what is actually configured is read from
  // the keys. See lib/tool-capabilities.ts.
  | "ai.connection_mode"
  /**
   * Bearer token for the remote MCP endpoint at /api/mcp.
   *
   * Generated on demand, never derived from anything guessable. The
   * endpoint can read every client, run the agent and apply fixes to live
   * websites, so it is closed until a token exists.
   */
  | "mcp.access_token"
  /**
   * When an MCP client last called /api/mcp successfully — an ISO string.
   *
   * This is the only honest signal that a subscription is actually
   * connected. Nothing else observable proves a chat app is attached:
   * a token existing only proves one was generated.
   */
  | "mcp.last_seen_at"
  /** What the last caller said it was, for display. */
  | "mcp.last_client"
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
  | "digest.last_auto_run_at"
  // First-run wizard gate. ISO timestamp written when the user clicks
  // "Skip for now" on /welcome OR completes any meaningful step (adding
  // a client / configuring an AI provider clears the fresh state
  // naturally). Once set, the dashboard never redirects to /welcome again.
  | "onboarding.dismissed_at"
  // Opt-in browser-mode scrapers for AI search products that don't
  // have public APIs (Google AI Mode via ?udm=50, Microsoft Copilot).
  // Default OFF because these add ~15-20s per keyword per platform
  // to an "AI visibility check all keywords" run — big impact on
  // check-all latency. When ON, both providers get added to the
  // check list alongside API-based providers.
  | "ai_visibility.browser_scraped_enabled"
  // Daily auto-backup. Default ON. The user can disable from /settings/backup
  // if they prefer to manage backups externally (Restic / Borg / Time Machine).
  | "autobackup.enabled"
  | "autobackup.cadence_hours"
  | "autobackup.retention"
  | "autobackup.last_run_at"
  | "autobackup.last_bytes"
  | "autobackup.last_error"
  // Retention / cleanup. Default ON. Periodically deletes screenshots,
  // ai_calls, activity_log, and system_errors older than the
  // configured age. Audits + audit_issues are NEVER touched
  // (historical record). See src/lib/retention-cleanup.ts.
  | "retention.enabled"
  | "retention.cadence_hours"
  | "retention.screenshots_days"
  | "retention.ai_calls_days"
  | "retention.activity_days"
  | "retention.errors_days"
  | "retention.last_run_at"
  | "retention.last_summary"
  | "retention.last_error";

/**
 * True when the error is "the schema isn't there yet" rather than a
 * real failure. Two situations produce it, and neither is a bug worth
 * crashing over:
 *
 *   1. `next build` prerendering pages against a data.db that hasn't
 *      been migrated. `pnpm build` runs the migrate hook first, but a
 *      bare `next build` (or any tool that invokes Next directly)
 *      doesn't — and the whole build died with
 *      "SqliteError: no such table: workspace_settings", which reads
 *      like a code fault rather than a missing setup step.
 *   2. A half-finished install where migrations errored partway.
 *
 * In both cases the honest answer for a *settings read* is "no value
 * set", not a 500. Writes still throw — silently discarding a save
 * would be much worse than failing loudly.
 */
function isMissingSchemaError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return /no such table|no such column/i.test(msg);
}

let warnedMissingSchema = false;

export async function getSetting<T = unknown>(
  key: SettingKey,
): Promise<T | null> {
  try {
    const [row] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.key, key))
      .limit(1);
    return (row?.value as T | undefined) ?? null;
  } catch (err) {
    if (!isMissingSchemaError(err)) throw err;
    // Warn once per process — a build prerendering 50 pages shouldn't
    // print 50 identical warnings, but silence would hide a genuinely
    // broken install.
    if (!warnedMissingSchema) {
      warnedMissingSchema = true;
      console.warn(
        "[settings] workspace_settings table is missing — reading defaults. " +
          "Run `node scripts/migrate.cjs` (or `pnpm build`, which does it for you).",
      );
    }
    return null;
  }
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
