/**
 * Turning a list of scheduled tasks back into the plan they came from.
 *
 * Onboarding generates thirty tasks with due dates spread across a month
 * and tells the user it made a plan. The tasks board then shows them as
 * thirty undifferentiated rows among everything else, so the plan exists
 * in the database and nowhere a person can see it.
 *
 * Pure, and separate from the page, because the grouping is the part
 * worth testing: an off-by-one in the week maths puts work in the wrong
 * week, which is not visible by looking — every row is still there and
 * every date is still right, so it reads as correct.
 */

export type PlanTaskRow = {
  id: number;
  title: string;
  whyItMatters: string | null;
  status: string;
  dueDate: Date | number | string | null;
  estimatedMinutes: number | null;
  sourceRef: string | null;
};

export type PlanItem = PlanTaskRow & { dueLabel: string };

export type PlanWeekView = {
  label: string;
  /** "12 Sep – 18 Sep", for reading rather than sorting. */
  range: string;
  items: PlanItem[];
};

export type PlanView = {
  weeks: PlanWeekView[];
  total: number;
  done: number;
  totalMinutes: number;
};

function asDate(v: PlanTaskRow["dueDate"]): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DAY = 86_400_000;

function short(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Group by week from the earliest due date, not from the calendar week.
 *
 * A plan generated on a Thursday would otherwise open with a two-day
 * "week 1", which makes the first week look empty and the whole schedule
 * look wrong. Weeks here mean "the first seven days of the plan", which
 * is what the person reading it means too.
 *
 * Tasks with no due date are kept rather than dropped, in their own
 * group at the end. Silently losing a task because a date failed to
 * parse is exactly the kind of quiet wrong answer this codebase keeps
 * finding.
 */
export function groupPlanByWeek(rows: readonly PlanTaskRow[]): PlanView {
  const dated: { row: PlanTaskRow; due: Date }[] = [];
  const undated: PlanTaskRow[] = [];
  for (const r of rows) {
    const d = asDate(r.dueDate);
    if (d) dated.push({ row: r, due: d });
    else undated.push(r);
  }
  dated.sort((a, b) => a.due.getTime() - b.due.getTime());

  const weeks: PlanWeekView[] = [];
  if (dated.length > 0) {
    const start = dated[0].due.getTime();
    const buckets = new Map<number, { row: PlanTaskRow; due: Date }[]>();
    for (const d of dated) {
      const index = Math.floor((d.due.getTime() - start) / (7 * DAY));
      const list = buckets.get(index);
      if (list) list.push(d);
      else buckets.set(index, [d]);
    }
    for (const index of [...buckets.keys()].sort((a, b) => a - b)) {
      const items = buckets.get(index)!;
      const from = new Date(start + index * 7 * DAY);
      const to = new Date(start + ((index + 1) * 7 - 1) * DAY);
      weeks.push({
        label: `Week ${index + 1}`,
        range: `${short(from)} – ${short(to)}`,
        items: items.map(({ row, due }) => ({ ...row, dueLabel: short(due) })),
      });
    }
  }

  if (undated.length > 0) {
    weeks.push({
      label: "No date",
      range: "not scheduled",
      items: undated.map((row) => ({ ...row, dueLabel: "—" })),
    });
  }

  return {
    weeks,
    total: rows.length,
    done: rows.filter((r) => r.status === "done").length,
    totalMinutes: rows.reduce((n, r) => n + (r.estimatedMinutes ?? 0), 0),
  };
}
