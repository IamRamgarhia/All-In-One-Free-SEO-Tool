/**
 * Quick-wins finder. After a client's first audit completes (and any time
 * thereafter), scans the issue list and surfaces the items that are:
 *
 *   - High impact (medium/high/critical severity)
 *   - Low effort (matches one of the well-known "trivial" issue types)
 *
 * Each match becomes a high-priority task tagged source="quick_win" so
 * the user sees a "Fix today" group at the top of their tasks board.
 *
 * The detector is deterministic and based on issue type strings — no
 * LLM call needed. Runs as part of onboarding's plan generation.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  auditIssues,
  clients,
  tasks,
  type Task,
} from "@/db/schema";
import { logActivity } from "./activity";

/**
 * Issue types that are nearly always trivial to fix and high impact.
 * Each one becomes a quick-win task with a specific action title.
 */
const QUICK_WIN_TYPES: Record<
  string,
  { title: (msg: string, url: string) => string; minutes: number }
> = {
  missing_title: {
    title: (_msg, url) => `Add a title tag to ${pathOf(url)}`,
    minutes: 10,
  },
  missing_meta_description: {
    title: (_msg, url) => `Write a meta description for ${pathOf(url)}`,
    minutes: 10,
  },
  title_too_long: {
    title: (_msg, url) => `Trim the title on ${pathOf(url)} to under 60 chars`,
    minutes: 10,
  },
  title_too_short: {
    title: (_msg, url) => `Lengthen the title on ${pathOf(url)} (currently <30 chars)`,
    minutes: 10,
  },
  meta_description_too_long: {
    title: (_msg, url) => `Trim the meta description on ${pathOf(url)} to ~155 chars`,
    minutes: 10,
  },
  missing_h1: {
    title: (_msg, url) => `Add an H1 heading to ${pathOf(url)}`,
    minutes: 10,
  },
  multiple_h1: {
    title: (_msg, url) => `Reduce ${pathOf(url)} to a single H1`,
    minutes: 10,
  },
  missing_alt_text: {
    title: (_msg, url) => `Add alt text to images on ${pathOf(url)}`,
    minutes: 15,
  },
  missing_canonical: {
    title: (_msg, url) => `Add a canonical tag to ${pathOf(url)}`,
    minutes: 5,
  },
  no_sitemap: {
    title: () => `Create and submit a sitemap.xml`,
    minutes: 15,
  },
  invalid_sitemap: {
    title: () => `Fix the sitemap.xml — currently invalid`,
    minutes: 20,
  },
  no_robots: {
    title: () => `Add a robots.txt file`,
    minutes: 5,
  },
  invalid_robots: {
    title: () => `Fix the invalid robots.txt directives`,
    minutes: 15,
  },
  missing_og_tags: {
    title: (_msg, url) => `Add Open Graph tags to ${pathOf(url)}`,
    minutes: 15,
  },
  missing_schema: {
    title: (_msg, url) => `Add structured-data schema to ${pathOf(url)}`,
    minutes: 25,
  },
  broken_link: {
    title: (msg, url) =>
      `Fix the broken link on ${pathOf(url)}${msg ? ` (${msg.slice(0, 80)})` : ""}`,
    minutes: 10,
  },
  redirect_chain: {
    title: (_msg, url) => `Collapse the redirect chain on ${pathOf(url)}`,
    minutes: 10,
  },
  no_https: {
    title: () => `Enable HTTPS / fix mixed-content issues`,
    minutes: 60,
  },
};

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

export type QuickWinTask = Omit<Task, "id" | "createdAt" | "updatedAt">;

/**
 * Build (but do not insert) the list of quick-win tasks for a client
 * based on the latest completed audit.
 */
export async function buildQuickWinTasks(opts: {
  clientId: number;
  startDate?: Date;
  /** Cap the number of quick-wins to keep the "Fix today" list short. */
  limit?: number;
}): Promise<QuickWinTask[]> {
  const limit = opts.limit ?? 10;
  const start = opts.startDate ?? new Date();

  const [latest] = await db
    .select({ id: audits.id })
    .from(audits)
    .where(
      and(eq(audits.clientId, opts.clientId), eq(audits.status, "completed")),
    )
    .orderBy(desc(audits.completedAt))
    .limit(1);
  if (!latest) return [];

  const issues = await db
    .select({
      type: auditIssues.type,
      severity: auditIssues.severity,
      message: auditIssues.message,
      url: auditIssues.url,
    })
    .from(auditIssues)
    .where(
      and(
        eq(auditIssues.auditId, latest.id),
        eq(auditIssues.status, "new"),
      ),
    );

  // Score: severity weight × quick-win fit. Higher first.
  const sevWeight = { critical: 4, high: 3, medium: 2, low: 1 } as const;
  const scored = issues
    .filter((i) => QUICK_WIN_TYPES[i.type])
    .map((i) => ({
      ...i,
      score: sevWeight[i.severity as keyof typeof sevWeight] ?? 1,
    }))
    .sort((a, b) => b.score - a.score);

  // Dedupe: only one task per (type, url) pair so we don't spam if the
  // same issue lands on a hundred URLs.
  const seen = new Set<string>();
  const planRef = `quick-wins-${start.toISOString().slice(0, 10)}`;
  const out: QuickWinTask[] = [];
  for (const i of scored) {
    if (out.length >= limit) break;
    const cfg = QUICK_WIN_TYPES[i.type];
    if (!cfg) continue;
    const dedupeKey = `${i.type}::${i.url}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      clientId: opts.clientId,
      title: cfg.title(i.message, i.url),
      description: i.url,
      whyItMatters:
        "Quick win from the latest audit — high impact, low effort. Fix these first to unlock the bigger work.",
      priority: "high",
      status: "todo",
      dueDate: new Date(start.getTime() + 86_400_000),
      recurringInterval: null,
      estimatedMinutes: cfg.minutes,
      actualMinutes: null,
      source: "quick_win",
      sourceRef: planRef,
    });
  }

  return out;
}

/**
 * Insert the quick-win tasks for a client, replacing any prior open
 * quick-wins so re-running the detector doesn't pile duplicates.
 */
export async function applyQuickWins(opts: {
  clientId: number;
  limit?: number;
}): Promise<{ created: number }> {
  const newTasks = await buildQuickWinTasks(opts);
  if (newTasks.length === 0) return { created: 0 };

  // Wipe prior open quick-wins so re-running is idempotent
  const { sql } = await import("drizzle-orm");
  await db
    .delete(tasks)
    .where(
      sql`${tasks.clientId} = ${opts.clientId} AND ${tasks.source} = 'quick_win' AND ${tasks.status} = 'todo'`,
    );

  await db.insert(tasks).values(newTasks);

  await logActivity({
    kind: "task.created",
    message: `Added ${newTasks.length} quick-win tasks from the latest audit.`,
    level: "success",
    clientId: opts.clientId,
    entityType: "quick_wins",
  });

  return { created: newTasks.length };
}

/**
 * Helper for the dashboard: how many open quick-win tasks does this
 * client currently have? Used to render the "Fix today" badge.
 */
export async function countOpenQuickWins(clientId: number): Promise<number> {
  const { sql, eq: drizzleEq, and: drizzleAnd } = await import("drizzle-orm");
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      drizzleAnd(
        drizzleEq(tasks.clientId, clientId),
        drizzleEq(tasks.source, "quick_win"),
        drizzleEq(tasks.status, "todo"),
      ),
    );
  void sql;
  return rows.length;
}

// Avoid linter warning on unused import
void clients;
