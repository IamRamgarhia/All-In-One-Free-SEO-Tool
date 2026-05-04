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
  // Google integrations — paired against the Google account connected
  // workspace-wide via OAuth. Each is the property identifier the user picks.
  // gscProperty: "sc-domain:example.com" or "https://example.com/"
  // ga4PropertyId: numeric e.g. "123456789"
  gscProperty: text("gsc_property"),
  ga4PropertyId: text("ga4_property_id"),
  // Per-client Google OAuth tokens — overrides workspace-wide credentials
  // when set. Lets agencies connect each client's OWN Google account
  // separately (when the client doesn't share access with the agency).
  googleRefreshToken: text("google_refresh_token"),
  googleAccessToken: text("google_access_token"),
  googleAccessTokenExpiresAt: integer("google_access_token_expires_at"),
  googleConnectedEmail: text("google_connected_email"),
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
  ...timestamps,
});

export const keywords = sqliteTable("keywords", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  country: text("country").notNull().default("US"),
  device: text("device", { enum: ["desktop", "mobile"] })
    .notNull()
    .default("desktop"),
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
export type AuditIssue = typeof auditIssues.$inferSelect;
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
