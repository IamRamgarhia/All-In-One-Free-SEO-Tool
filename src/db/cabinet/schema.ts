/**
 * Cabinet d'audit — PostgreSQL schema.
 *
 * SEOmator is the audit engine; SEO-Tool owns clients, sites, history,
 * diffs and the action plan. UUIDs + timestamptz + jsonb throughout.
 */

import { sql } from "drizzle-orm";
import {
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const cabinetClients = pgTable("cabinet_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sector: text("sector"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const cabinetSites = pgTable("cabinet_sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => cabinetClients.id, { onDelete: "cascade" }),
  name: text("name"),
  url: text("url").notNull(),
  environment: text("environment").notNull().default("production"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const auditRuns = pgTable("audit_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => cabinetSites.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("seomator"),
  status: text("status").notNull().default("pending"),
  /** pending | running | completed | failed */
  globalScore: integer("global_score"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  rawReport: jsonb("raw_report").$type<Record<string, unknown>>(),
  categoryScores: jsonb("category_scores").$type<
    Record<string, { score: number; pass: number; warn: number; fail: number }>
  >(),
  errorMessage: text("error_message"),
  pagesCrawled: integer("pages_crawled"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const cabinetAuditIssues = pgTable("cabinet_audit_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditRunId: uuid("audit_run_id")
    .notNull()
    .references(() => auditRuns.id, { onDelete: "cascade" }),
  siteId: uuid("site_id")
    .notNull()
    .references(() => cabinetSites.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").notNull(),
  category: text("category"),
  /** pass | warn | fail — SEOmator rule status */
  status: text("status"),
  /** critical | high | medium | low — prioritisation severity */
  severity: text("severity"),
  title: text("title"),
  description: text("description"),
  recommendation: text("recommendation"),
  affectedUrls: jsonb("affected_urls").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const auditRuleHistory = pgTable("audit_rule_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => cabinetSites.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").notNull(),
  auditRunId: uuid("audit_run_id")
    .notNull()
    .references(() => auditRuns.id, { onDelete: "cascade" }),
  status: text("status"),
  score: integer("score"),
  checkedAt: timestamp("checked_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const auditDiffs = pgTable("audit_diffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => cabinetSites.id, { onDelete: "cascade" }),
  previousAuditId: uuid("previous_audit_id").references(() => auditRuns.id),
  currentAuditId: uuid("current_audit_id")
    .notNull()
    .references(() => auditRuns.id),
  fixedRules: jsonb("fixed_rules").$type<string[]>().default([]),
  regressedRules: jsonb("regressed_rules").$type<string[]>().default([]),
  newIssues: jsonb("new_issues").$type<string[]>().default([]),
  worsenedRules: jsonb("worsened_rules").$type<string[]>().default([]),
  scoreDelta: integer("score_delta"),
  categoryDeltas: jsonb("category_deltas").$type<Record<string, number>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const cabinetActions = pgTable("cabinet_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => cabinetSites.id, { onDelete: "cascade" }),
  issueId: uuid("issue_id").references(() => cabinetAuditIssues.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  /** P0 | P1 | P2 | P3 */
  priority: text("priority").notNull().default("P2"),
  /** S | M | L | XL */
  effort: text("effort"),
  /** todo | in_progress | done | verified */
  status: text("status").notNull().default("todo"),
  owner: text("owner"),
  dueDate: date("due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type CabinetClient = typeof cabinetClients.$inferSelect;
export type CabinetSite = typeof cabinetSites.$inferSelect;
export type AuditRun = typeof auditRuns.$inferSelect;
export type CabinetAuditIssue = typeof cabinetAuditIssues.$inferSelect;
export type CabinetAction = typeof cabinetActions.$inferSelect;
export type AuditDiff = typeof auditDiffs.$inferSelect;
