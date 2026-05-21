import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
};

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  niche: text("niche", {
    enum: ["local", "ecommerce", "saas", "blog", "services"],
  }),
  techStack: text("tech_stack", { mode: "json" }).$type<string[]>(),
  shareToken: text("share_token").unique(),
  // Auto-extracted metadata from the client's site (CLAUDE.md Part 6, Layer 1).
  // All optional — populated on add-client when reachable, editable later.
  logoUrl: text("logo_url"),
  description: text("description"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  socialLinks: text("social_links", { mode: "json" }).$type<ClientSocialLinks>(),
  gbpUrl: text("gbp_url"),
  // Targeting — every recommendation, rank check, SERP scan, autocomplete
  // fan-out, and citation suggestion uses these. country defaults to "US"
  // for back-compat with rows created before this column existed.
  country: text("country").default("US"),
  /** BCP-47 short code: "en", "en-GB", "es-MX", "hi-IN", etc. */
  language: text("language").default("en"),
  /** City the business primarily serves. Required for niche=local. */
  city: text("city"),
  /** "country" | "city" | "multi" — how aggressively rank-tracker varies geo. */
  geoTarget: text("geo_target", { enum: ["country", "city", "multi"] })
    .default("country"),
  /** Free-text — Google's category list is huge and changes; we let users type. */
  businessType: text("business_type"),
  /** Service-area radius in km when geoTarget = city. */
  serviceRadiusKm: integer("service_radius_km"),
  /** Onboarding state machine — once "completed", the wizard hides. */
  onboardingStep: text("onboarding_step", {
    enum: ["pending", "brand", "keywords", "targeting", "completed"],
  }).default("pending"),
  /** Generated 30-day plan timestamp — null = not generated yet. */
  planGeneratedAt: integer("plan_generated_at", { mode: "timestamp" }),
  // Google integrations — paired against the Google account connected
  // workspace-wide via OAuth. Each is the property identifier the user picks.
  // gscProperty: "sc-domain:example.com" or "https://example.com/"
  // ga4PropertyId: numeric e.g. "123456789"
  gscProperty: text("gsc_property"),
  ga4PropertyId: text("ga4_property_id"),
  // WordPress bridge credentials — set when the SEO Tool Bridge plugin
  // is installed on the client's WordPress site. Enables one-click
  // application of SEO fixes (titles, meta, schema, alt text).
  wpEndpoint: text("wp_endpoint"),
  wpKey: text("wp_key"),
  // Per-client Google OAuth tokens — overrides workspace-wide credentials
  // when set. Lets agencies connect each client's OWN Google account
  // separately (when the client doesn't share access with the agency).
  googleRefreshToken: text("google_refresh_token"),
  googleAccessToken: text("google_access_token"),
  googleAccessTokenExpiresAt: integer("google_access_token_expires_at"),
  googleConnectedEmail: text("google_connected_email"),
  /** Per-client opt-out for the report-generation branding pre-flight.
      When TRUE, the user has explicitly chosen "generate reports without
      branding" for this client — we stop asking. */
  brandingSkipped: integer("branding_skipped", { mode: "boolean" })
    .notNull()
    .default(false),
  ...timestamps,
});

export type ClientSocialLinks = {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  tiktok?: string;
  pinterest?: string;
  github?: string;
};

export const audits = sqliteTable("audits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed"],
  })
    .notNull()
    .default("queued"),
  score: integer("score"),
  issuesCount: integer("issues_count").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  /** "crawler" (existing site-wide audit) | "ai_full" (AI single-page audit). */
  kind: text("kind").notNull().default("crawler"),
  /** For ai_full: which URL was analyzed. */
  targetUrl: text("target_url"),
  /** AI-written executive summary of the audit. */
  summary: text("summary"),
  ...timestamps,
});

export const auditIssues = sqliteTable("audit_issues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  auditId: integer("audit_id")
    .notNull()
    .references(() => audits.id, { onDelete: "cascade" }),
  severity: text("severity", {
    enum: ["critical", "high", "medium", "low"],
  }).notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  message: text("message").notNull(),
  status: text("status", {
    enum: ["new", "resolved", "ignored", "false_positive"],
  })
    .notNull()
    .default("new"),
  /** Markdown fix steps written by the AI for AI-generated audits. */
  fixSteps: text("fix_steps"),
  /** Top-level grouping (technical / on-page / content / E-E-A-T / etc). */
  category: text("category"),
  /** Whether this issue came from the AI audit runner vs the crawler. */
  aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(false),
  /** User-added sticky notes. */
  notes: text("notes"),
  /**
   * How confident the tool is in this finding. Drives the
   * ConfidenceBadge in the UI and helps users prioritize:
   *   "definitely" — objective measurement; no reasonable false positive
   *   "probably"   — best-practice heuristic; could be intentional
   *   "test"       — AI guess; verify before acting
   * Nullable so legacy rows remain untouched; new inserts must populate.
   */
  confidence: text("confidence", { enum: ["definitely", "probably", "test"] }),
  ...timestamps,
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  whyItMatters: text("why_it_matters"),
  priority: text("priority", { enum: ["high", "medium", "low"] })
    .notNull()
    .default("medium"),
  status: text("status", {
    enum: ["todo", "in_progress", "done", "skipped"],
  })
    .notNull()
    .default("todo"),
  dueDate: integer("due_date", { mode: "timestamp" }),
  recurringInterval: text("recurring_interval", {
    enum: ["daily", "weekly", "monthly", "quarterly"],
  }),
  /** Estimated time to complete in minutes — for capacity planning. */
  estimatedMinutes: integer("estimated_minutes"),
  /** Actual logged minutes — accumulated by the timer / manual entry. */
  actualMinutes: integer("actual_minutes"),
  /** Marks tasks generated by the 30-day calendar so we can group them. */
  source: text("source"),
  /** Identifier of the plan run that produced this task (date-stamp). */
  sourceRef: text("source_ref"),
  ...timestamps,
});

export const keywords = sqliteTable("keywords", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  country: text("country").notNull().default("US"),
  /** Optional city (lat-long-style geo for local rank checks). */
  city: text("city"),
  /** BCP-47 language for hl=. */
  language: text("language").default("en"),
  device: text("device", { enum: ["desktop", "mobile"] })
    .notNull()
    .default("desktop"),
  /** Marks keywords surfaced by the auto-discovery engine. */
  source: text("source"),
  ...timestamps,
});

export const workspaceSettings = sqliteTable("workspace_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const aiVisibilityChecks = sqliteTable("ai_visibility_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keywordId: integer("keyword_id")
    .notNull()
    .references(() => keywords.id, { onDelete: "cascade" }),
  provider: text("provider", {
    enum: [
      "anthropic",
      "openai",
      "gemini",
      "perplexity",
      "openrouter",
      "groq",
      "ollama",
      "mistral",
      "deepseek",
      "cerebras",
      "together",
      "github",
    ],
  }).notNull(),
  prompt: text("prompt").notNull(),
  response: text("response").notNull(),
  citations: text("citations", { mode: "json" }).$type<string[]>(),
  mentionsDomain: integer("mentions_domain", { mode: "boolean" })
    .notNull()
    .default(false),
  citationsForDomain: integer("citations_for_domain")
    .notNull()
    .default(0),
  error: text("error"),
  checkedAt: integer("checked_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const seoResources = sqliteTable("seo_resources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  da: integer("da"),
  alexa: integer("alexa"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const resourceSubmissions = sqliteTable("resource_submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  resourceId: integer("resource_id")
    .notNull()
    .references(() => seoResources.id, { onDelete: "cascade" }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["pending", "submitted", "live", "rejected", "lost"],
  })
    .notNull()
    .default("pending"),
  submittedUrl: text("submitted_url"),
  notes: text("notes"),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
  ...timestamps,
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull(),
  status: text("status", {
    enum: ["draft", "sent", "paid", "overdue", "void"],
  })
    .notNull()
    .default("draft"),
  issueDate: integer("issue_date", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  dueDate: integer("due_date", { mode: "timestamp" }),
  paidAt: integer("paid_at", { mode: "timestamp" }),
  items: text("items", { mode: "json" })
    .$type<{ description: string; quantity: number; rate: number }[]>()
    .notNull(),
  currency: text("currency").notNull().default("USD"),
  taxRate: integer("tax_rate").notNull().default(0), // basis points (0–10000)
  notes: text("notes"),
  ...timestamps,
});

/**
 * Generic snapshot store — every quick tool can save its result here so users
 * can compare before/after over time. Keyed by tool kind + a free-form label
 * (usually a URL or query) so multiple snapshots of the same target stack up.
 */
export const newsFeeds = sqliteTable("news_feeds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  name: text("name").notNull(),
  category: text("category", {
    enum: ["google", "industry", "blog", "tracker", "twitter", "custom"],
  })
    .notNull()
    .default("custom"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
  lastError: text("last_error"),
  ...timestamps,
});

export const newsItems = sqliteTable("news_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  feedId: integer("feed_id")
    .notNull()
    .references(() => newsFeeds.id, { onDelete: "cascade" }),
  /** Hash of the link so we can dedupe across re-fetches. */
  guid: text("guid").notNull(),
  title: text("title").notNull(),
  link: text("link").notNull(),
  summary: text("summary"),
  author: text("author"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const toolSnapshots = sqliteTable("tool_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Optional client this belongs to. Null = workspace-level / standalone. */
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  /** Tool that produced this snapshot — string for forward-compat. */
  kind: text("kind", {
    enum: [
      "cwv",
      "headers",
      "redirect_chain",
      "og_preview",
      "heading_outline",
      "content_stats",
      "robots",
      "security",
      "hreflang",
      "image_audit",
      "broken_links",
      "schema",
      "ai_overview",
    ],
  }).notNull(),
  /** Human label (URL, keyword, etc.) for grouping over time. */
  label: text("label").notNull(),
  /** Optional short description shown in lists. */
  note: text("note"),
  /** The result payload — stringified JSON of whatever the tool returned. */
  data: text("data", { mode: "json" }).$type<unknown>().notNull(),
  /** Optional headline number for quick comparisons (e.g. CWV score). */
  primaryMetric: integer("primary_metric"),
  primaryMetricLabel: text("primary_metric_label"),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const cwvReports = sqliteTable("cwv_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  strategy: text("strategy", { enum: ["mobile", "desktop"] })
    .notNull()
    .default("mobile"),
  /** 0-100 Lighthouse performance score */
  performance: integer("performance"),
  accessibility: integer("accessibility"),
  bestPractices: integer("best_practices"),
  seo: integer("seo"),
  /** Largest Contentful Paint, ms */
  lcpMs: integer("lcp_ms"),
  /** Interaction to Next Paint, ms */
  inpMs: integer("inp_ms"),
  /** Cumulative Layout Shift × 100 to keep integer */
  cls: integer("cls_x100"),
  /** Time to First Byte, ms */
  ttfbMs: integer("ttfb_ms"),
  /** First Contentful Paint, ms */
  fcpMs: integer("fcp_ms"),
  /** Total Blocking Time, ms */
  tbtMs: integer("tbt_ms"),
  /** PSI top opportunities, JSON list */
  opportunities: text("opportunities", { mode: "json" }).$type<
    { id: string; title: string; savingsMs: number | null; description: string }[]
  >(),
  /** "PASS" | "NEEDS_IMPROVEMENT" | "FAIL" overall — derived */
  overall: text("overall", {
    enum: ["pass", "needs_improvement", "fail"],
  }),
  error: text("error"),
  scannedAt: integer("scanned_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const serpScans = sqliteTable("serp_scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keywordId: integer("keyword_id")
    .notNull()
    .references(() => keywords.id, { onDelete: "cascade" }),
  /** Whether the headless browser successfully rendered + parsed the SERP. */
  ok: integer("ok", { mode: "boolean" }).notNull().default(true),
  error: text("error"),
  /** Whether Google's AI Overview block was present. */
  aiOverviewPresent: integer("ai_overview_present", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Plain-text excerpt of the AI Overview, if present. */
  aiOverviewText: text("ai_overview_text"),
  /** Domains/sources cited inside the AI Overview, if any. */
  aiOverviewSources: text("ai_overview_sources", { mode: "json" }).$type<
    string[]
  >(),
  /** People Also Ask questions in the SERP. */
  paaQuestions: text("paa_questions", { mode: "json" }).$type<string[]>(),
  /** Related searches at the bottom of the SERP. */
  relatedSearches: text("related_searches", { mode: "json" }).$type<
    string[]
  >(),
  /** Top organic results extracted from the page. */
  topResults: text("top_results", { mode: "json" }).$type<
    {
      position: number;
      title: string;
      url: string;
      domain: string;
      snippet: string | null;
      isClient: boolean;
    }[]
  >(),
  /** Featured snippet shown at the top, if any. */
  featuredSnippet: text("featured_snippet", { mode: "json" }).$type<{
    title: string;
    url: string;
    excerpt: string | null;
  } | null>(),
  /** True if the local pack (3-pack map) was visible. */
  localPackPresent: integer("local_pack_present", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Estimated total results count Google showed at the top. */
  totalResults: integer("total_results"),
  scannedAt: integer("scanned_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const aiSuggestions = sqliteTable("ai_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** What kind of fix the agent is proposing. */
  type: text("type", {
    enum: [
      "title_rewrite",
      "meta_description_rewrite",
      "quick_win_action",
      "content_idea",
      "internal_link",
      "schema_markup",
      "h1_rewrite",
      "general",
    ],
  }).notNull(),
  /** Which page this suggestion targets, if any. */
  targetUrl: text("target_url"),
  /** Current value (for rewrites): the title/meta/H1 we'd be replacing. */
  currentValue: text("current_value"),
  /** Suggested replacement / action text. */
  suggestedValue: text("suggested_value").notNull(),
  /** Short rationale shown in the UI. */
  rationale: text("rationale"),
  /** Where the suggestion came from: audit findings, GSC quick wins, etc. */
  source: text("source", {
    enum: ["audit", "gsc", "niche", "competitor", "agent"],
  })
    .notNull()
    .default("agent"),
  /** "new" | "applied" (user marked done) | "dismissed" */
  status: text("status", {
    enum: ["new", "applied", "dismissed"],
  })
    .notNull()
    .default("new"),
  /** Optional priority for sorting: high impact first. */
  priority: text("priority", {
    enum: ["high", "medium", "low"],
  })
    .notNull()
    .default("medium"),
  ...timestamps,
});

export const reportSchedules = sqliteTable("report_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  template: text("template", {
    enum: ["executive", "detailed", "technical"],
  })
    .notNull()
    .default("detailed"),
  frequency: text("frequency", {
    enum: ["weekly", "monthly"],
  })
    .notNull()
    .default("monthly"),
  /** 1-28 (we cap at 28 to dodge month-length edge cases) for monthly. */
  dayOfMonth: integer("day_of_month").default(1),
  /** 0=Sunday … 6=Saturday for weekly. */
  dayOfWeek: integer("day_of_week").default(1),
  /** Local hour-of-day (0-23) when the runner sends the email. */
  hourOfDay: integer("hour_of_day").notNull().default(9),
  recipients: text("recipients", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastSentAt: integer("last_sent_at", { mode: "timestamp" }),
  nextSendAt: integer("next_send_at", { mode: "timestamp" }),
  ...timestamps,
});

export const automations = sqliteTable("automations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  trigger: text("trigger", {
    enum: [
      "audit_completed",
      "audit_failed",
      "score_drop",
      "page_change",
      "rank_drop",
    ],
  }).notNull(),
  // null = applies to all clients
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  // JSON array of action steps; each step is { kind, ...args }
  actions: text("actions", { mode: "json" })
    .$type<AutomationAction[]>()
    .notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  runCount: integer("run_count").notNull().default(0),
  ...timestamps,
});

export type AutomationAction =
  | { kind: "webhook"; url: string }
  | {
      kind: "create_task";
      title: string;
      priority: "high" | "medium" | "low";
      whyItMatters?: string;
    }
  | { kind: "log"; message: string };

export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  level: text("level", {
    enum: ["info", "success", "warning", "error"],
  })
    .notNull()
    .default("info"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const outreachContacts = sqliteTable("outreach_contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  website: text("website"),
  status: text("status", {
    enum: ["prospect", "contacted", "replied", "won", "lost"],
  })
    .notNull()
    .default("prospect"),
  notes: text("notes"),
  lastContactedAt: integer("last_contacted_at", { mode: "timestamp" }),
  ...timestamps,
});

export const outreachTemplates = sqliteTable("outreach_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Null = workspace-wide template, scoped to a client otherwise. */
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  /** Stored variable hints for the template ("{{name}}", "{{site}}"). */
  variables: text("variables", { mode: "json" }).$type<string[]>(),
  ...timestamps,
});

export const outreachMessages = sqliteTable("outreach_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .notNull()
    .references(() => outreachContacts.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => outreachTemplates.id, {
    onDelete: "set null",
  }),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", {
    enum: ["sent", "failed"],
  }).notNull(),
  error: text("error"),
  sentAt: integer("sent_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const serpScreenshots = sqliteTable("serp_screenshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keywordId: integer("keyword_id")
    .notNull()
    .references(() => keywords.id, { onDelete: "cascade" }),
  position: integer("position"),
  filePath: text("file_path").notNull(),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const monitoredPages = sqliteTable("monitored_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  label: text("label"),
  status: text("status", { enum: ["active", "paused"] })
    .notNull()
    .default("active"),
  lastTitle: text("last_title"),
  lastDescription: text("last_description"),
  lastH1: text("last_h1"),
  lastCanonical: text("last_canonical"),
  lastContentHash: text("last_content_hash"),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
  ...timestamps,
});

export const pageChanges = sqliteTable("page_changes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monitoredPageId: integer("monitored_page_id")
    .notNull()
    .references(() => monitoredPages.id, { onDelete: "cascade" }),
  field: text("field", {
    enum: ["title", "description", "h1", "canonical", "content"],
  }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  detectedAt: integer("detected_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const contentBriefs = sqliteTable("content_briefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  targetKeyword: text("target_keyword").notNull(),
  title: text("title").notNull(),
  status: text("status", {
    enum: ["idea", "outline", "draft", "review", "published"],
  })
    .notNull()
    .default("idea"),
  targetWordCount: integer("target_word_count"),
  outline: text("outline", { mode: "json" }).$type<
    { heading: string; level: number }[]
  >(),
  paaQuestions: text("paa_questions", { mode: "json" }).$type<string[]>(),
  competitorTitles: text("competitor_titles", { mode: "json" }).$type<
    { title: string; url: string }[]
  >(),
  notes: text("notes"),
  publishedUrl: text("published_url"),
  /** Target publish date for the content calendar. */
  scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
  ...timestamps,
});

export const backlinks = sqliteTable("backlinks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  sourceDomain: text("source_domain").notNull(),
  targetUrl: text("target_url"),
  anchorText: text("anchor_text"),
  domainAuthority: integer("domain_authority"),
  status: text("status", {
    enum: ["active", "lost", "disavow"],
  })
    .notNull()
    .default("active"),
  notes: text("notes"),
  /** "discovered" = found via GSC/scrape; "manual" = user logged it after building. */
  source: text("source", { enum: ["discovered", "manual"] })
    .notNull()
    .default("discovered"),
  /** Method/strategy: outreach, guest_post, citation, broken_link, etc. */
  method: text("method"),
  /** Whether the link is dofollow / nofollow / sponsored / ugc — best guess. */
  rel: text("rel"),
  /** Date the user actually placed the link (vs when our tool first saw it). */
  placedAt: integer("placed_at", { mode: "timestamp" }),
  firstSeen: integer("first_seen", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  lastSeen: integer("last_seen", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  ...timestamps,
});

export const competitors = sqliteTable("competitors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  notes: text("notes"),
  ...timestamps,
});

export const keywordRankings = sqliteTable("keyword_rankings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keywordId: integer("keyword_id")
    .notNull()
    .references(() => keywords.id, { onDelete: "cascade" }),
  position: integer("position"),
  url: text("url"),
  checkedAt: integer("checked_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  // Device the rank was checked on. "desktop" is the historic default —
  // pre-existing rows without this column read as "desktop". Mobile
  // rankings often diverge by 1-3 positions due to mobile-specific SERP
  // features (AI Overview, Local Pack injected higher on mobile).
  device: text("device", { enum: ["desktop", "mobile"] })
    .notNull()
    .default("desktop"),
  // SERP feature flags captured at the same time as the rank — populated when
  // the rank check is run via the SERP scanner (Playwright). Default 0 so
  // rows from older browser-mode checks remain valid.
  hasAiOverview: integer("has_ai_overview", { mode: "boolean" }).default(false),
  hasFeaturedSnippet: integer("has_featured_snippet", {
    mode: "boolean",
  }).default(false),
  hasLocalPack: integer("has_local_pack", { mode: "boolean" }).default(false),
  paaCount: integer("paa_count").default(0),
});

export const gbpPlaybookCompletions = sqliteTable("gbp_playbook_completions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** ID matching items in src/lib/gbp-playbook.ts */
  itemId: text("item_id").notNull(),
  /** When the user marked this complete. */
  completedAt: integer("completed_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  /** For recurring items: which occurrence (e.g. "2026-W18" for week-18 of 2026). */
  occurrence: text("occurrence"),
});

export const shortLinks = sqliteTable("short_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  slug: text("slug").notNull().unique(),
  destination: text("destination").notNull(),
  label: text("label"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmTerm: text("utm_term"),
  utmContent: text("utm_content"),
  clickCount: integer("click_count").notNull().default(0),
  lastClickAt: integer("last_click_at", { mode: "timestamp" }),
  ...timestamps,
});

export const shortLinkClicks = sqliteTable("short_link_clicks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shortLinkId: integer("short_link_id")
    .notNull()
    .references(() => shortLinks.id, { onDelete: "cascade" }),
  userAgent: text("user_agent"),
  referer: text("referer"),
  countryHint: text("country_hint"),
  clickedAt: integer("clicked_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const brandMentions = sqliteTable("brand_mentions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  source: text("source", {
    enum: ["reddit", "hackernews", "bluesky", "mastodon", "rss"],
  }).notNull(),
  externalId: text("external_id").notNull(),
  url: text("url").notNull(),
  author: text("author"),
  title: text("title"),
  excerpt: text("excerpt"),
  sentiment: integer("sentiment").notNull().default(0),
  linksToClient: integer("links_to_client", { mode: "boolean" })
    .notNull()
    .default(false),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const titleTests = sqliteTable("title_tests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** The page being tested. */
  pageUrl: text("page_url").notNull(),
  /** Optional WordPress post ID — needed if we're rotating via the bridge. */
  wpPostId: integer("wp_post_id"),
  /** All candidate titles, including the original. */
  variants: text("variants", { mode: "json" })
    .$type<{ title: string; appliedAt: string | null }[]>()
    .notNull(),
  /** Index of the currently-applied variant. */
  currentVariantIdx: integer("current_variant_idx").notNull().default(0),
  /** Days each variant gets before rotation. */
  variantDurationDays: integer("variant_duration_days").notNull().default(14),
  /** Per-variant performance, captured at the end of each rotation period. */
  measurements: text("measurements", { mode: "json" }).$type<
    {
      variantIdx: number;
      title: string;
      startedAt: string;
      endedAt: string;
      clicks: number;
      impressions: number;
      ctr: number;
      avgPosition: number;
    }[]
  >(),
  status: text("status", {
    enum: ["running", "completed", "paused"],
  })
    .notNull()
    .default("running"),
  /** Index of the winning variant once a winner is picked. */
  winnerVariantIdx: integer("winner_variant_idx"),
  /** When the most recent rotation happened. */
  lastRotatedAt: integer("last_rotated_at", { mode: "timestamp" }),
  ...timestamps,
});

export const localGridSchedules = sqliteTable("local_grid_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  centerLat: integer("center_lat").notNull(),
  centerLng: integer("center_lng").notNull(),
  gridSize: integer("grid_size").notNull().default(5),
  spacingM: integer("spacing_m").notNull().default(1500),
  cadence: text("cadence", {
    enum: ["weekly", "monthly"],
  })
    .notNull()
    .default("weekly"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRanAt: integer("last_ran_at", { mode: "timestamp" }),
  ...timestamps,
});

export const localGridChecks = sqliteTable("local_grid_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  centerLat: integer("center_lat").notNull(),
  centerLng: integer("center_lng").notNull(),
  gridSize: integer("grid_size").notNull().default(5),
  spacingM: integer("spacing_m").notNull().default(1500),
  cells: text("cells", { mode: "json" }).$type<
    { lat: number; lng: number; position: number | null }[]
  >(),
  avgPosition: integer("avg_position"),
  inPackPct: integer("in_pack_pct"),
  ranAt: integer("ran_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const competitorSnapshots = sqliteTable("competitor_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  competitorUrl: text("competitor_url").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  silos: text("silos", { mode: "json" }).$type<
    { silo: string; count: number }[]
  >(),
  schemaTypes: text("schema_types", { mode: "json" }).$type<string[]>(),
  backlinkDomains: text("backlink_domains", { mode: "json" }).$type<
    string[]
  >(),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const clientMetricSnapshots = sqliteTable("client_metric_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  kind: text("kind", {
    enum: ["baseline", "weekly", "monthly", "manual"],
  })
    .notNull()
    .default("weekly"),
  healthScore: integer("health_score"),
  organicClicks: integer("organic_clicks"),
  organicImpressions: integer("organic_impressions"),
  organicAvgPositionX100: integer("organic_avg_position_x100"),
  ga4Sessions: integer("ga4_sessions"),
  ga4Users: integer("ga4_users"),
  ga4Conversions: integer("ga4_conversions"),
  ga4RevenueX100: integer("ga4_revenue_x100"),
  keywordCount: integer("keyword_count"),
  avgRankX100: integer("avg_rank_x100"),
  top10Count: integer("top10_count"),
  criticalIssues: integer("critical_issues"),
  highIssues: integer("high_issues"),
  backlinkCount: integer("backlink_count"),
  gbpScore: integer("gbp_score"),
  mentionCount: integer("mention_count"),
  tasksDoneRecent: integer("tasks_done_recent"),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const aiFeedback = sqliteTable("ai_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** What kind of AI output this critiques. */
  feature: text("feature", {
    enum: [
      "exec_summary",
      "blog_draft",
      "title_rewrite",
      "meta_rewrite",
      "review_reply",
      "content_idea",
      "general",
    ],
  }).notNull(),
  /** Optional client this output was for. */
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  /** Original AI output (before any user edits). */
  aiOutput: text("ai_output").notNull(),
  /** Optional user-corrected version — gold-standard reference. */
  correctedOutput: text("corrected_output"),
  /** -1 = thumbs down, +1 = thumbs up. */
  rating: integer("rating", { mode: "number" }).notNull(),
  /** Optional free-text note: what was wrong / what they wanted. */
  note: text("note"),
  ...timestamps,
});

export const aiPreferences = sqliteTable("ai_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Null = workspace-wide preference, otherwise scoped to a client. */
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  /** What feature this rule applies to. */
  feature: text("feature").notNull(),
  /** Plain-language rule, e.g. "Use UK English. Never use em-dashes." */
  rule: text("rule").notNull(),
  /** How confident the system is — auto-promoted to high after 3+ confirms. */
  confidence: text("confidence", {
    enum: ["low", "medium", "high"],
  })
    .notNull()
    .default("low"),
  /** Number of corrections this rule was derived from. */
  derivedFrom: integer("derived_from").notNull().default(1),
  /** Mark inactive without deleting — user disabled it manually. */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const botLogUploads = sqliteTable("bot_log_uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  sourceName: text("source_name"),
  rawByteSize: integer("raw_byte_size"),
  lineCount: integer("line_count"),
  /** JSON object: { "GPTBot": 412, "ClaudeBot": 117, … } */
  botCounts: text("bot_counts", { mode: "json" }).$type<
    Record<string, number>
  >(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Audit = typeof audits.$inferSelect;
export type NewAudit = typeof audits.$inferInsert;
export type AuditIssue = typeof auditIssues.$inferSelect;
export type NewAuditIssue = typeof auditIssues.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type KeywordRanking = typeof keywordRankings.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;
export type Backlink = typeof backlinks.$inferSelect;
export type NewBacklink = typeof backlinks.$inferInsert;
export type ContentBrief = typeof contentBriefs.$inferSelect;
export type NewContentBrief = typeof contentBriefs.$inferInsert;
export type MonitoredPage = typeof monitoredPages.$inferSelect;
export type NewMonitoredPage = typeof monitoredPages.$inferInsert;
export type PageChange = typeof pageChanges.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
export type OutreachContact = typeof outreachContacts.$inferSelect;
export type NewOutreachContact = typeof outreachContacts.$inferInsert;
export type OutreachTemplate = typeof outreachTemplates.$inferSelect;
export type NewOutreachTemplate = typeof outreachTemplates.$inferInsert;
export type OutreachMessage = typeof outreachMessages.$inferSelect;
export type NewOutreachMessage = typeof outreachMessages.$inferInsert;
export type SerpScreenshot = typeof serpScreenshots.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type SeoResource = typeof seoResources.$inferSelect;
export type NewSeoResource = typeof seoResources.$inferInsert;
export type ResourceSubmission = typeof resourceSubmissions.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type AiVisibilityCheck = typeof aiVisibilityChecks.$inferSelect;
export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type NewReportSchedule = typeof reportSchedules.$inferInsert;
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type NewAiSuggestion = typeof aiSuggestions.$inferInsert;
export type SerpScan = typeof serpScans.$inferSelect;
export type NewSerpScan = typeof serpScans.$inferInsert;
export type CwvReport = typeof cwvReports.$inferSelect;
export type NewCwvReport = typeof cwvReports.$inferInsert;
export type ToolSnapshot = typeof toolSnapshots.$inferSelect;
export type NewToolSnapshot = typeof toolSnapshots.$inferInsert;
export type NewsFeed = typeof newsFeeds.$inferSelect;
export type NewNewsFeed = typeof newsFeeds.$inferInsert;
export type NewsItem = typeof newsItems.$inferSelect;
export type NewNewsItem = typeof newsItems.$inferInsert;
export type BotLogUpload = typeof botLogUploads.$inferSelect;
export type NewBotLogUpload = typeof botLogUploads.$inferInsert;
export type GbpPlaybookCompletion = typeof gbpPlaybookCompletions.$inferSelect;
export type NewGbpPlaybookCompletion = typeof gbpPlaybookCompletions.$inferInsert;
export type ShortLink = typeof shortLinks.$inferSelect;
export type NewShortLink = typeof shortLinks.$inferInsert;
export type ShortLinkClick = typeof shortLinkClicks.$inferSelect;
export type BrandMention = typeof brandMentions.$inferSelect;
export type NewBrandMention = typeof brandMentions.$inferInsert;
export type LocalGridCheck = typeof localGridChecks.$inferSelect;
export type NewLocalGridCheck = typeof localGridChecks.$inferInsert;
export type LocalGridSchedule = typeof localGridSchedules.$inferSelect;
export type NewLocalGridSchedule = typeof localGridSchedules.$inferInsert;
export type TitleTest = typeof titleTests.$inferSelect;
export type NewTitleTest = typeof titleTests.$inferInsert;
export type ClientMetricSnapshot = typeof clientMetricSnapshots.$inferSelect;
export type NewClientMetricSnapshot = typeof clientMetricSnapshots.$inferInsert;
export type CompetitorSnapshot = typeof competitorSnapshots.$inferSelect;
export type NewCompetitorSnapshot = typeof competitorSnapshots.$inferInsert;
export type AiFeedback = typeof aiFeedback.$inferSelect;
export type NewAiFeedback = typeof aiFeedback.$inferInsert;
export type AiPreference = typeof aiPreferences.$inferSelect;
export type NewAiPreference = typeof aiPreferences.$inferInsert;

// =============== Public API keys ===============

export const apiKeys = sqliteTable("api_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** sha256 of the full key — only the prefix is shown to the user after generation. */
  keyHash: text("key_hash").notNull().unique(),
  /** First 8 chars of the key for display ("seo_live_a3f9..."). */
  keyPrefix: text("key_prefix").notNull(),
  scopes: text("scopes", { mode: "json" })
    .$type<("read" | "write" | "admin")[]>()
    .notNull()
    .default(sql`('["read"]')`),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
});
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

// =============== Inbound webhooks ===============

export const inboundWebhooks = sqliteTable("inbound_webhooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  name: text("name").notNull(),
  /** "generic" / "github" / "linear" / "google_alerts" / "custom" — used for parsing. */
  eventType: text("event_type").notNull().default("generic"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastReceivedAt: integer("last_received_at", { mode: "timestamp" }),
  receiveCount: integer("receive_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type InboundWebhook = typeof inboundWebhooks.$inferSelect;
export type NewInboundWebhook = typeof inboundWebhooks.$inferInsert;

export const inboundWebhookEvents = sqliteTable("inbound_webhook_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  webhookId: integer("webhook_id")
    .notNull()
    .references(() => inboundWebhooks.id, { onDelete: "cascade" }),
  payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
  headers: text("headers", { mode: "json" }).$type<Record<string, string>>(),
  sourceIp: text("source_ip"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type InboundWebhookEvent = typeof inboundWebhookEvents.$inferSelect;
export type NewInboundWebhookEvent = typeof inboundWebhookEvents.$inferInsert;

// =============== AI usage log ===============

export const aiCalls = sqliteTable("ai_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  feature: text("feature").notNull(),
  provider: text("provider").notNull(),
  model: text("model"),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  /** Cost in micros (millionths of USD). 1 USD = 1_000_000. */
  costMicros: integer("cost_micros").notNull().default(0),
  latencyMs: integer("latency_ms"),
  clientId: integer("client_id"),
  status: text("status").notNull().default("ok"),
  errorMsg: text("error_msg"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type AiCall = typeof aiCalls.$inferSelect;
export type NewAiCall = typeof aiCalls.$inferInsert;

// =============== SERP feature snapshots ===============

export const serpFeatureSnapshots = sqliteTable("serp_feature_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keywordId: integer("keyword_id"),
  query: text("query").notNull(),
  country: text("country").notNull().default("US"),
  ourDomain: text("our_domain"),
  ourPosition: integer("our_position"),
  ourUrl: text("our_url"),
  hasAio: integer("has_aio", { mode: "boolean" }).notNull().default(false),
  aioSources: text("aio_sources", { mode: "json" }).$type<string[]>(),
  aioIncludesUs: integer("aio_includes_us", { mode: "boolean" })
    .notNull()
    .default(false),
  hasFeaturedSnippet: integer("has_featured_snippet", { mode: "boolean" })
    .notNull()
    .default(false),
  featuredUrl: text("featured_url"),
  featuredOwnedByUs: integer("featured_owned_by_us", { mode: "boolean" })
    .notNull()
    .default(false),
  paaQuestions: text("paa_questions", { mode: "json" }).$type<string[]>(),
  topResults: text("top_results", { mode: "json" }).$type<
    { position: number; title: string; url: string; domain: string }[]
  >(),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type SerpFeatureSnapshot = typeof serpFeatureSnapshots.$inferSelect;
export type NewSerpFeatureSnapshot = typeof serpFeatureSnapshots.$inferInsert;

// =============== Robots.txt history ===============

export const robotsSnapshots = sqliteTable("robots_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id"),
  hostname: text("hostname").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  status: integer("status"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type RobotsSnapshot = typeof robotsSnapshots.$inferSelect;
export type NewRobotsSnapshot = typeof robotsSnapshots.$inferInsert;

// =============== Uptime monitor ===============

export const uptimeTargets = sqliteTable("uptime_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id"),
  url: text("url").notNull(),
  label: text("label"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  expectedStatus: integer("expected_status").notNull().default(200),
  expectedText: text("expected_text"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type UptimeTarget = typeof uptimeTargets.$inferSelect;
export type NewUptimeTarget = typeof uptimeTargets.$inferInsert;

export const uptimePings = sqliteTable("uptime_pings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  targetId: integer("target_id")
    .notNull()
    .references(() => uptimeTargets.id, { onDelete: "cascade" }),
  status: integer("status"),
  latencyMs: integer("latency_ms"),
  ok: integer("ok", { mode: "boolean" }).notNull().default(false),
  error: text("error"),
  checkedAt: integer("checked_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type UptimePing = typeof uptimePings.$inferSelect;
export type NewUptimePing = typeof uptimePings.$inferInsert;

// =============== Redirect manager + 404 log ===============

export const redirectRules = sqliteTable("redirect_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id"),
  sourcePath: text("source_path").notNull(),
  targetUrl: text("target_url").notNull(),
  statusCode: integer("status_code").notNull().default(301),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type RedirectRule = typeof redirectRules.$inferSelect;
export type NewRedirectRule = typeof redirectRules.$inferInsert;

export const notFoundLog = sqliteTable("not_found_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id"),
  sourcePath: text("source_path").notNull(),
  hits: integer("hits").notNull().default(1),
  firstSeen: integer("first_seen", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  lastSeen: integer("last_seen", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  resolvedToUrl: text("resolved_to_url"),
});
export type NotFoundLog = typeof notFoundLog.$inferSelect;
export type NewNotFoundLog = typeof notFoundLog.$inferInsert;

/**
 * AI-written guest post drafts. Tied to a client and a curated guest-post
 * site (see `lib/guest-post-sites.ts`). The lifecycle:
 *
 *   draft  → pitched → accepted → published → live
 *                   ↘ rejected
 *
 * `liveUrl` is filled when the post goes live; `publishedAt` is the
 * timestamp that flows into monthly reports under "Links built this period".
 */
export const guestPostDrafts = sqliteTable("guest_post_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** Slug from `GUEST_POST_SITES`. Free text for forward-compat. */
  siteId: text("site_id").notNull(),
  siteName: text("site_name").notNull(),
  siteDomain: text("site_domain").notNull(),
  topic: text("topic").notNull(),
  targetKeyword: text("target_keyword").notNull(),
  supportingKeywords: text("supporting_keywords"),
  authorName: text("author_name"),
  authorBio: text("author_bio"),
  markdown: text("markdown").notNull(),
  qaIssues: text("qa_issues", { mode: "json" }).$type<
    { severity: string; message: string }[]
  >(),
  status: text("status", {
    enum: ["draft", "pitched", "accepted", "published", "rejected"],
  })
    .notNull()
    .default("draft"),
  liveUrl: text("live_url"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  pitchedAt: integer("pitched_at", { mode: "timestamp" }),
  ...timestamps,
});
export type GuestPostDraft = typeof guestPostDrafts.$inferSelect;
export type NewGuestPostDraft = typeof guestPostDrafts.$inferInsert;

/**
 * Knowledge Panel snapshots — periodic capture of Google's brand Knowledge
 * Panel content for tracked clients. Diff between consecutive snapshots
 * surfaces changes (description, founder, sameAs, social profiles, image).
 */
export const knowledgePanelSnapshots = sqliteTable("knowledge_panel_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** Brand query that surfaced the panel ("Acme Inc"). */
  query: text("query").notNull(),
  /** Whether a Knowledge Panel was present at this scan. */
  present: integer("present", { mode: "boolean" }).notNull().default(false),
  title: text("title"),
  subtitle: text("subtitle"),
  description: text("description"),
  imageUrl: text("image_url"),
  /** Wikipedia / Crunchbase / etc. — entity sameAs links. */
  sameAs: text("same_as", { mode: "json" }).$type<string[]>(),
  /** Free-text social URLs Google shows in the panel. */
  socials: text("socials", { mode: "json" }).$type<string[]>(),
  /** Any factual rows shown (founder, headquarters, etc). */
  facts: text("facts", { mode: "json" }).$type<
    { label: string; value: string }[]
  >(),
  /** Raw HTML excerpt for forensics. Limited to ~32KB. */
  rawHtml: text("raw_html"),
  capturedAt: integer("captured_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type KnowledgePanelSnapshot = typeof knowledgePanelSnapshots.$inferSelect;
export type NewKnowledgePanelSnapshot = typeof knowledgePanelSnapshots.$inferInsert;

/**
 * Author topic-authority tracking. We periodically scan competitors' /author/
 * pages (and similar bylines) to map which named authors publish in our niche
 * — and which have credentials, social links, or Wikipedia entries that
 * suggest topical authority. Used to identify outreach targets and to
 * benchmark our own author bylines against competitors.
 */
export const authorAuthorityRecords = sqliteTable("author_authority_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** Domain we observed this author on. */
  domain: text("domain").notNull(),
  /** Author display name. */
  authorName: text("author_name").notNull(),
  /** Profile / bio URL on the source domain. */
  authorUrl: text("author_url"),
  /** Job title / byline tagline. */
  jobTitle: text("job_title"),
  bio: text("bio"),
  /** Total post count we observed in the niche. */
  postCount: integer("post_count").notNull().default(0),
  /** Topics inferred from their post titles. */
  topics: text("topics", { mode: "json" }).$type<string[]>(),
  /** External profile URLs (Twitter, LinkedIn, Wikipedia, etc.). */
  sameAs: text("same_as", { mode: "json" }).$type<string[]>(),
  /** Heuristic 0-100 authority score. */
  authorityScore: integer("authority_score").notNull().default(0),
  /** When we first saw them. */
  firstSeen: integer("first_seen", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  lastSeen: integer("last_seen", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type AuthorAuthorityRecord = typeof authorAuthorityRecords.$inferSelect;
export type NewAuthorAuthorityRecord = typeof authorAuthorityRecords.$inferInsert;

/**
 * Generic tool-run persistence.
 *
 * Many ad-hoc tools (CrUX origin, perf budget, facet trap, screenshot
 * import, AIO passage, reputation abuse, Person schema) used to throw
 * away their output as soon as the page reloaded. This table is the
 * universal escape hatch: any tool can save its result here as JSON,
 * the user can browse history, restore a prior run, pin one, or delete.
 *
 * Tools with their own purpose-built tables (knowledge panel snapshots,
 * audits, content_briefs, etc.) still use those — this is for tools
 * where a custom schema would be overkill.
 */
export const toolRuns = sqliteTable("tool_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Optional — null for tools that aren't tied to a specific client. */
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  /** Tool slug — matches the route segment, e.g. "crux-origin", "perf-budget". */
  toolId: text("tool_id").notNull(),
  /** Short human label so list views are readable without parsing JSON. */
  label: text("label").notNull(),
  /** The raw input the user submitted (URL, query, etc.) for re-running. */
  inputJson: text("input_json", { mode: "json" }).$type<Record<string, unknown>>(),
  /** The full structured output. Tools deserialize their own shape. */
  resultJson: text("result_json", { mode: "json" }).$type<unknown>(),
  /** User-pinned runs survive bulk-clear. */
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  /** Optional free-form notes the user can add. */
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type ToolRun = typeof toolRuns.$inferSelect;
export type NewToolRun = typeof toolRuns.$inferInsert;

/**
 * Per-finding tracking for AI tools. Each row is one actionable item the
 * user can mark complete. Shared across SXO / GEO / E-E-A-T / AI site
 * audit / schema check / etc. — the checklist UX is built once and every
 * tool gets it for free.
 */
export const toolFindings = sqliteTable(
  "tool_findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => toolRuns.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    toolId: text("tool_id").notNull(),
    /** Stable identifier within a tool ("sxo.page_promise.no_h1" etc.).
        Re-check uses this to match findings across runs. */
    signature: text("signature").notNull(),
    title: text("title").notNull(),
    category: text("category"),
    severity: text("severity", {
      enum: ["critical", "high", "medium", "low", "pass"],
    })
      .notNull()
      .default("medium"),
    details: text("details"),
    fixSteps: text("fix_steps"),
    codeSnippet: text("code_snippet"),
    status: text("status", {
      enum: ["new", "in_progress", "resolved", "ignored"],
    })
      .notNull()
      .default("new"),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    completedNote: text("completed_note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);
export type ToolFinding = typeof toolFindings.$inferSelect;
export type NewToolFinding = typeof toolFindings.$inferInsert;

/**
 * Chat conversation persistence — covers SEO chat, Ask the Tool, and the
 * client portal chat. Each conversation is a thread; messages live in the
 * sibling chat_messages table.
 */
export const chatConversations = sqliteTable("chat_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", {
    enum: ["seo_chat", "ask_tool", "portal_chat"],
  }).notNull(),
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  settings: text("settings", { mode: "json" }).$type<Record<string, unknown>>(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type ChatConversation = typeof chatConversations.$inferSelect;
export type NewChatConversation = typeof chatConversations.$inferInsert;

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "error"] }).notNull(),
  content: text("content").notNull(),
  imageDataUrl: text("image_data_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

/**
 * Generated client report archive. Stores PDF bytes (base64) + the
 * structured data the PDF was rendered from, so reports can be
 * re-downloaded forever and compared period-over-period.
 */
export const reportArchives = sqliteTable("report_archives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  periodStart: integer("period_start", { mode: "timestamp" }),
  periodEnd: integer("period_end", { mode: "timestamp" }),
  template: text("template"),
  pdfBase64: text("pdf_base64"),
  pdfBytes: integer("pdf_bytes"),
  dataSnapshot: text("data_snapshot", { mode: "json" }).$type<unknown>(),
  execSummary: text("exec_summary"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type ReportArchive = typeof reportArchives.$inferSelect;
export type NewReportArchive = typeof reportArchives.$inferInsert;

/**
 * Chart annotations — manual markers on time-series visualizations
 * (rank tracker, GSC traffic chart, GA4 chart, CWV trend, etc.).
 *
 * Use cases:
 *   - Algorithm update markers ("Google March 2026 core update")
 *   - Content events ("Published new pillar page")
 *   - Technical events ("Migrated to Next.js 16")
 *   - Outreach milestones ("HARO mention in TechCrunch")
 *
 * `scope` controls which charts show the annotation:
 *   - "global" — shown across all clients (Google algo updates, etc.)
 *   - "client" — only on this client's charts
 *   - "keyword" — only on this keyword's rank chart
 *   - "page" — only on this page's traffic chart
 */
export const annotations = sqliteTable("annotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  keywordId: integer("keyword_id").references(() => keywords.id, {
    onDelete: "cascade",
  }),
  pageUrl: text("page_url"),
  scope: text("scope", {
    enum: ["global", "client", "keyword", "page"],
  }).notNull(),
  /** The event date (when to draw the marker). */
  eventDate: integer("event_date", { mode: "timestamp" }).notNull(),
  /** Short label shown on the chart. */
  label: text("label").notNull(),
  /** Longer description shown on hover / in the activity list. */
  description: text("description"),
  /** Kind for color-coding: algo, content, technical, outreach, custom. */
  kind: text("kind", {
    enum: ["algo", "content", "technical", "outreach", "custom"],
  })
    .notNull()
    .default("custom"),
  /** Source — manual / auto from activity log / from algorithm-updates feed. */
  source: text("source", { enum: ["manual", "auto", "feed"] })
    .notNull()
    .default("manual"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;

/**
 * Centralized error log. Captures every server-side exception (server
 * actions, API routes, background workers) and every client-side error
 * (window.onerror, unhandledrejection) so the user has one place to look
 * when something's flaky and a copy-pasteable bundle for GitHub issues.
 *
 * Capped at the last 1,000 rows by a trim that runs on every insert.
 */
export const systemErrors = sqliteTable("system_errors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** "server" (route/action), "client" (browser), "worker" (daily agent etc). */
  source: text("source", { enum: ["server", "client", "worker"] }).notNull(),
  /** Where it came from — route path, action name, worker step. */
  context: text("context").notNull(),
  /** First line of the error message. */
  message: text("message").notNull(),
  /** Optional full stack trace. */
  stack: text("stack"),
  /** Optional URL the user was on. */
  url: text("url"),
  /** Optional userAgent — only set for client-side errors. */
  userAgent: text("user_agent"),
  /** Number of times this same (source, context, message) seen. */
  occurrences: integer("occurrences").notNull().default(1),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
});
export type SystemError = typeof systemErrors.$inferSelect;
export type NewSystemError = typeof systemErrors.$inferInsert;

/**
 * Manual report data — work the user did that isn't auto-trackable.
 * Pasted as plain text in /report-data, AI structures it into kind +
 * title + url + details. Surfaces in monthly reports as "Work done."
 */
export const manualReportData = sqliteTable("manual_report_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** Categorisation. */
  kind: text("kind", {
    enum: [
      "backlink",
      "outreach",
      "comment",
      "social_post",
      "review",
      "milestone",
      "note",
    ],
  }).notNull(),
  title: text("title").notNull(),
  url: text("url"),
  details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
  happenedAt: integer("happened_at", { mode: "timestamp" }),
  rawText: text("raw_text"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type ManualReportData = typeof manualReportData.$inferSelect;
export type NewManualReportData = typeof manualReportData.$inferInsert;

/**
 * Per-client recurring automation. Each row says "for client X, every N
 * days at HH:MM UTC, auto-generate a Y and either drop it into the
 * review queue or publish it directly."
 *
 * kinds:
 *   blog_draft         — AI brief + draft → WordPress (draft or publish)
 *   gbp_post           — ≤1500 char copy → Google Business Profile localPosts API
 *   social_post        — short copy → copy-to-clipboard (no auto-OAuth in v1)
 *   internal_checklist — tasks rows seeded for the day (no external publish)
 */
export const dailySchedules = sqliteTable("daily_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  kind: text("kind", {
    enum: ["blog_draft", "gbp_post", "social_post", "internal_checklist"],
  }).notNull(),
  /** 1 for daily, 7 for weekly, 30 for monthly. */
  cadenceDays: integer("cadence_days").notNull().default(1),
  /** HHMM in UTC, e.g. 900 = 09:00 UTC. */
  timeUtc: integer("time_utc").notNull().default(900),
  /** When true, skip the review queue and publish directly on the next tick. */
  autoPublish: integer("auto_publish", { mode: "boolean" })
    .notNull()
    .default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** Kind-specific knobs. */
  configJson: text("config_json", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type DailySchedule = typeof dailySchedules.$inferSelect;
export type NewDailySchedule = typeof dailySchedules.$inferInsert;

/**
 * Generated-content queue. Every schedule run lands one row here. The
 * user reviews via /clients/[id]/queue and approves; the daily-agent's
 * publish step then runs the right publisher and flips status to
 * "published" or "failed".
 *
 * Schedules with auto_publish=true bypass pending_review and land
 * directly as "approved".
 */
export const publishQueue = sqliteTable("publish_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scheduleId: integer("schedule_id").references(() => dailySchedules.id, {
    onDelete: "set null",
  }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  kind: text("kind", {
    enum: ["blog_draft", "gbp_post", "social_post", "internal_checklist"],
  }).notNull(),
  status: text("status", {
    enum: ["pending_review", "approved", "published", "skipped", "failed"],
  })
    .notNull()
    .default("pending_review"),
  title: text("title"),
  body: text("body"),
  payloadJson: text("payload_json", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  scheduledFor: integer("scheduled_for", { mode: "timestamp" }).notNull(),
  generatedAt: integer("generated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  /** External identifier returned by the publisher (WP post ID, GBP post name). */
  publishedRef: text("published_ref"),
  errorMsg: text("error_msg"),
  reviewNote: text("review_note"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type PublishQueueItem = typeof publishQueue.$inferSelect;
export type NewPublishQueueItem = typeof publishQueue.$inferInsert;

