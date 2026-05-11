/**
 * Generic tool-run persistence.
 *
 * Tools that don't have a dedicated table use this layer to save their
 * output so the user can recall, pin, or delete a past run. Adding a new
 * tool to the system is as simple as calling `saveToolRun` after a
 * successful run.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { toolRuns, type NewToolRun, type ToolRun } from "@/db/schema";

export type ToolRunInput<TResult = unknown, TInput = Record<string, unknown>> = {
  toolId: string;
  label: string;
  clientId?: number | null;
  input?: TInput;
  result: TResult;
};

export async function saveToolRun<TResult, TInput = Record<string, unknown>>(
  run: ToolRunInput<TResult, TInput>,
): Promise<number> {
  const insert: NewToolRun = {
    clientId: run.clientId ?? null,
    toolId: run.toolId,
    label: run.label.slice(0, 200),
    inputJson: (run.input ?? null) as Record<string, unknown> | null,
    resultJson: run.result,
  };
  const [row] = await db
    .insert(toolRuns)
    .values(insert)
    .returning({ id: toolRuns.id });
  return row.id;
}

export async function listToolRuns(opts: {
  toolId?: string;
  clientId?: number | null;
  limit?: number;
}): Promise<ToolRun[]> {
  const conditions = [];
  if (opts.toolId) conditions.push(eq(toolRuns.toolId, opts.toolId));
  if (typeof opts.clientId === "number")
    conditions.push(eq(toolRuns.clientId, opts.clientId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const limit = Math.max(1, Math.min(200, opts.limit ?? 25));
  return db
    .select()
    .from(toolRuns)
    .where(where)
    .orderBy(desc(toolRuns.pinned), desc(toolRuns.createdAt))
    .limit(limit);
}

export async function getToolRun(id: number): Promise<ToolRun | null> {
  const [row] = await db
    .select()
    .from(toolRuns)
    .where(eq(toolRuns.id, id))
    .limit(1);
  return row ?? null;
}

export async function deleteToolRun(id: number): Promise<void> {
  await db.delete(toolRuns).where(eq(toolRuns.id, id));
}

export async function togglePin(id: number): Promise<void> {
  const r = await getToolRun(id);
  if (!r) return;
  await db
    .update(toolRuns)
    .set({ pinned: !r.pinned })
    .where(eq(toolRuns.id, id));
}

/** Bulk-clear all unpinned runs for a tool. */
export async function clearToolRuns(opts: {
  toolId: string;
  clientId?: number | null;
}): Promise<number> {
  const conditions = [
    eq(toolRuns.toolId, opts.toolId),
    eq(toolRuns.pinned, false),
  ];
  if (typeof opts.clientId === "number") {
    conditions.push(eq(toolRuns.clientId, opts.clientId));
  }
  const result = await db
    .delete(toolRuns)
    .where(and(...conditions))
    .returning({ id: toolRuns.id });
  return result.length;
}

export async function clearAllRuns(): Promise<number> {
  const result = await db
    .delete(toolRuns)
    .where(eq(toolRuns.pinned, false))
    .returning({ id: toolRuns.id });
  return result.length;
}

export async function setRunNotes(
  id: number,
  notes: string | null,
): Promise<void> {
  await db
    .update(toolRuns)
    .set({ notes: notes?.slice(0, 2000) ?? null })
    .where(eq(toolRuns.id, id));
}

export const TOOL_LABELS: Record<string, string> = {
  "crux-origin": "CrUX origin summary",
  "perf-budget": "Performance budget",
  "facet-trap": "Faceted-nav trap scan",
  "screenshot-import": "Screenshot import",
  "aio-passage": "AIO passage scoring",
  "reputation-abuse-risk": "Reputation abuse risk scan",
  "person-schema": "Person schema generator",
  "eeat-audit": "E-E-A-T audit",
  refresh: "Content refresh planner",
  "traffic-drop": "Traffic-drop diagnosis",
  "dns-whois": "DNS / WHOIS",
  "youtube-audit": "YouTube audit",
  "intent-classifier": "Search intent classifier",
  "keyword-difficulty": "Keyword difficulty",
  "content-grader": "Content grader",
  "anchor-distribution": "Anchor distribution",
  "backlink-discovery": "Backlink discovery",
  "canonical-audit": "Canonical audit",
  cluster: "Keyword cluster builder",
  "bulk-scan": "Bulk URL scan",
  "content-score": "Content score",
  hreflang: "Hreflang validator",
  "link-checker": "Link checker",
  "geo-score": "GEO composite score",
  sxo: "SXO audit",
  "attack-briefs": "Content attack briefs",
  "ai-schema": "AI schema generator",
  brief: "Composite content brief",
  "link-graph": "Internal link graph",
  "link-recommender": "AI internal-link recommender",
  "log-analyzer": "Server log analyzer",
  "migration-parity": "Migration parity audit",
  "mobile-friendly": "Mobile-friendly check",
  "domain-overview": "Domain overview",
  "image-gen": "AI image generation",
  "utm-attribution": "Multi-touch attribution",
  "rank-where": "Country-aware rank checker",
  "wp-hack-scan": "WordPress hack scan",
  "local-cwv": "Local Core Web Vitals",
  "soft-404": "Soft-404 catcher",
  trending: "Trending topics",
  "social-preview": "Social preview",
  summarizer: "Content summarizer",
  "news-headline": "News headline audit",
  plagiarism: "Plagiarism / AI detection",
  "outreach-personalize": "Outreach personalizer",
  "llms-txt": "llms.txt generator/validator",
  "bulk-alt": "Bulk alt text",
  "branded-split": "Branded vs non-branded GSC split",
  "ai-overview": "AI Overview readiness",
  disavow: "Disavow file generator",
  "reddit-research": "Reddit research",
  "og-image": "OG image generator",
  render: "Browser render check",
  pagerank: "Internal PageRank",
  "ai-slop": "AI slop detector (24 patterns)",
  "expert-panel": "Expert panel content scorer",
  "content-attack-brief": "Content attack brief",
};
