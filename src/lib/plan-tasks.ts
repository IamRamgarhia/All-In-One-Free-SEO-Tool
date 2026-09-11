/**
 * Turning the plan a client approved into work that gets tracked.
 *
 * The proposal generator already produces the right shape — thirteen
 * weeks grouped into Foundation, Content and authority, and Compound
 * growth. It was a document and nothing more. Nothing turned week six
 * into anything, nothing noticed when week six passed, and the monthly
 * report could not say whether the engagement was on plan or a fortnight
 * behind.
 *
 * That is the gap between knowing the work and shipping it, and it is
 * the one thing a client is actually paying for. A plan nobody delivers
 * against is a PDF.
 *
 * So: when a proposal is sent, its weeks become tasks with real due
 * dates, and the progress against them becomes something the client page
 * and the report can both read.
 *
 * Deliberately NOT a second task system. These are ordinary rows in
 * `tasks`, carrying `source: "plan"` and a `sourceRef` that names the
 * proposal and the week, so everything that already works on tasks — the
 * board, the overdue count, the ranked list, "work completed this
 * period" in the report — works on these without being taught anything.
 */

import { and, eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { proposals, tasks } from "@/db/schema";

export type PlanWeek = {
  week: string;
  focus: string;
  items: string[];
  phase?: string;
};

/** Where a plan task came from: `plan:<proposalId>:<weekIndex>`. */
export function planRef(proposalId: number, weekIndex: number): string {
  return `plan:${proposalId}:${weekIndex}`;
}

/** Every task belonging to this proposal, however many weeks it has. */
function refPrefix(proposalId: number): string {
  return `plan:${proposalId}:`;
}

/**
 * The date week N of the plan is due.
 *
 * Weeks run from the day the plan was sent, not from the day it was
 * drafted. A proposal written on Monday and sent on Friday starts on
 * Friday, because that is when the client agreed to it and when they
 * will start counting.
 *
 * Due at the END of each week, so a task is not overdue on the day it
 * becomes relevant.
 */
export function weekDueDate(startedAt: Date, weekIndex: number): Date {
  const d = new Date(startedAt);
  d.setDate(d.getDate() + (weekIndex + 1) * 7);
  return d;
}

/**
 * Read "Week 6" out of whatever the plan called it.
 *
 * The generator writes "Week 1", "Weeks 2-3" and similar. The number is
 * what decides the due date, and a plan whose labels change wording
 * should not silently reschedule itself — so the index falls back to the
 * position in the list when no number can be read.
 */
export function weekNumberFrom(label: string, fallbackIndex: number): number {
  const m = label.match(/(\d+)/);
  if (!m) return fallbackIndex;
  const n = Number.parseInt(m[1], 10);
  return Number.isInteger(n) && n > 0 ? n - 1 : fallbackIndex;
}

export type MaterialiseResult = {
  created: number;
  skipped: number;
  reason?: string;
};

/**
 * Create the tasks for a proposal's plan, once.
 *
 * Idempotent by `sourceRef`: re-sending a proposal, or a scheduler
 * running twice, must not double the client's task list. Existing rows
 * are left exactly as they are — including their status — because a task
 * somebody already completed must not reappear as todo.
 */
export async function materialisePlan(
  proposalId: number,
): Promise<MaterialiseResult> {
  const [p] = await db
    .select({
      id: proposals.id,
      clientId: proposals.clientId,
      timeline: proposals.timelineJson,
      sentAt: proposals.sentAt,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!p) return { created: 0, skipped: 0, reason: "no such proposal" };
  // A proposal built for a lead has no client to hang tasks on. That is
  // legitimate — it becomes one when the lead converts.
  if (!p.clientId) return { created: 0, skipped: 0, reason: "not linked to a client" };
  const timeline = (p.timeline ?? []) as PlanWeek[];
  if (timeline.length === 0) return { created: 0, skipped: 0, reason: "no timeline" };

  const existing = await db
    .select({ sourceRef: tasks.sourceRef })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, p.clientId),
        like(tasks.sourceRef, `${refPrefix(proposalId)}%`),
      ),
    );
  const already = new Set(existing.map((t) => t.sourceRef));

  const startedAt = p.sentAt ?? p.createdAt ?? new Date();
  const rows: (typeof tasks.$inferInsert)[] = [];
  let skipped = 0;

  timeline.forEach((wk, i) => {
    const index = weekNumberFrom(wk.week, i);
    const ref = planRef(proposalId, index);
    if (already.has(ref)) {
      skipped++;
      return;
    }
    rows.push({
      clientId: p.clientId!,
      title: `${wk.week} — ${wk.focus}`,
      description:
        wk.items.length > 0
          ? wk.items.map((it) => `• ${it}`).join("\n")
          : null,
      whyItMatters:
        "This is what the client approved for this week. Delivering the plan on " +
        "schedule is the thing they are paying for, and the monthly report says " +
        "whether it happened.",
      // The plan is the engagement. Everything else competes with it.
      priority: "high",
      status: "todo",
      dueDate: weekDueDate(startedAt, index),
      source: "plan",
      sourceRef: ref,
    });
  });

  if (rows.length > 0) await db.insert(tasks).values(rows);
  return { created: rows.length, skipped };
}

export type PlanProgress = {
  proposalId: number;
  /** 1-based, capped at the plan length. */
  currentWeek: number;
  totalWeeks: number;
  done: number;
  total: number;
  /** Past their due date and still not done. */
  overdue: number;
  /** The phase the plan says we are in, when it named one. */
  phase: string | null;
};

/**
 * How far through the approved plan this client is.
 *
 * Read by the client page and the monthly report, so a person and a
 * client see the same answer to "are we on track". The week is derived
 * from the calendar rather than from progress: being in week six having
 * done four weeks of work is exactly the fact worth surfacing, and a
 * progress-derived week would hide it.
 */
export async function planProgress(
  clientId: number,
): Promise<PlanProgress | null> {
  const [p] = await db
    .select({
      id: proposals.id,
      timeline: proposals.timelineJson,
      sentAt: proposals.sentAt,
      createdAt: proposals.createdAt,
      status: proposals.status,
    })
    .from(proposals)
    .where(eq(proposals.clientId, clientId))
    .orderBy(proposals.id)
    .limit(1);

  if (!p) return null;
  // A draft has not been agreed to, so there is no plan to be behind on.
  if (p.status === "draft" || p.status === "declined") return null;

  const timeline = (p.timeline ?? []) as PlanWeek[];
  if (timeline.length === 0) return null;

  const rows = await db
    .select({
      status: tasks.status,
      dueDate: tasks.dueDate,
      sourceRef: tasks.sourceRef,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        like(tasks.sourceRef, `${refPrefix(p.id)}%`),
      ),
    );

  // How long the plan RUNS, not how many rows it has.
  //
  // A thirteen-week plan can be four entries — "Week 1", "Weeks 2-3",
  // "Weeks 6-7", "Week 11". Counting entries said "week 4 of 4" five
  // weeks into an eleven-week engagement, which tells a client the work
  // is finished when most of it has not started.
  const weekIndexes = timeline.map((wk, i) => weekNumberFrom(wk.week, i));
  const lastWeek = Math.max(...weekIndexes) + 1;

  const startedAt = p.sentAt ?? p.createdAt ?? new Date();
  const weeksElapsed = Math.floor(
    (Date.now() - startedAt.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  const currentWeek = Math.min(Math.max(weeksElapsed + 1, 1), lastWeek);

  const now = Date.now();
  const done = rows.filter((r) => r.status === "done").length;
  const overdue = rows.filter(
    (r) =>
      r.status !== "done" &&
      r.dueDate instanceof Date &&
      r.dueDate.getTime() < now,
  ).length;

  return {
    proposalId: p.id,
    currentWeek,
    totalWeeks: lastWeek,
    done,
    total: rows.length,
    overdue,
    // The phase of the latest entry we have actually reached — indexing
    // by position would report whatever happened to sit fourth in the
    // list, which on the plan above is the phase two months away.
    phase: phaseAtWeek(timeline, weekIndexes, currentWeek - 1),
  };
}

/** The phase in force at a given week index, or null. */
function phaseAtWeek(
  timeline: readonly PlanWeek[],
  weekIndexes: readonly number[],
  week: number,
): string | null {
  let best: string | null = null;
  let bestWeek = -1;
  timeline.forEach((wk, i) => {
    const at = weekIndexes[i];
    if (at <= week && at > bestWeek) {
      bestWeek = at;
      best = wk.phase ?? null;
    }
  });
  return best;
}
