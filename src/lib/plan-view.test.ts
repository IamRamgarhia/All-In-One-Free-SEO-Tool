/**
 * Grouping thirty scheduled tasks back into the plan they came from.
 *
 * The failure this guards is invisible by looking: every task is still
 * listed and every date is still correct, so a plan with the work in the
 * wrong weeks reads as a plan with the work in the right weeks. Nobody
 * notices until they follow it.
 */

import { describe, expect, it } from "vitest";
import { groupPlanByWeek, type PlanTaskRow } from "./plan-view";

const START = new Date("2026-09-12T09:00:00Z");
const day = (n: number) =>
  new Date(START.getTime() + n * 86_400_000);

function task(over: Partial<PlanTaskRow> = {}): PlanTaskRow {
  return {
    id: Math.floor(Math.random() * 1e6),
    title: "Do the thing",
    whyItMatters: null,
    status: "todo",
    dueDate: START,
    estimatedMinutes: 30,
    sourceRef: "plan-2026-09-12",
    ...over,
  };
}

describe("weeks", () => {
  it("counts from the plan's first task, not the calendar week", () => {
    // A plan generated on a Thursday would otherwise open with a two-day
    // "week 1", making the first week look empty and the schedule wrong.
    const rows = [0, 3, 6, 7, 13, 14].map((n) => task({ dueDate: day(n) }));
    const p = groupPlanByWeek(rows);
    expect(p.weeks.map((w) => w.label)).toEqual(["Week 1", "Week 2", "Week 3"]);
    expect(p.weeks[0].items).toHaveLength(3);
    expect(p.weeks[1].items).toHaveLength(2);
    expect(p.weeks[2].items).toHaveLength(1);
  });

  it("puts day 7 in week 2 and day 6 in week 1", () => {
    // The off-by-one that would be invisible. Seven days is a week, so
    // the seventh day after the plan starts is the first day of week two.
    //
    // The day-0 task is not decoration: weeks are measured from the
    // earliest task, so without it the plan would start on day 6 and
    // both of the others would correctly land in week 1. This test
    // asserted that and was wrong about it.
    const p = groupPlanByWeek([
      task({ id: 0, dueDate: day(0) }),
      task({ id: 1, dueDate: day(6) }),
      task({ id: 2, dueDate: day(7) }),
    ]);
    expect(p.weeks[0].items.map((i) => i.id)).toEqual([0, 1]);
    expect(p.weeks[1].items.map((i) => i.id)).toEqual([2]);
  });

  it("orders tasks within a week by date", () => {
    const p = groupPlanByWeek([
      task({ id: 3, dueDate: day(4) }),
      task({ id: 1, dueDate: day(0) }),
      task({ id: 2, dueDate: day(2) }),
    ]);
    expect(p.weeks[0].items.map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it("skips weeks with nothing in them rather than inventing empties", () => {
    // A gap in the schedule is a real thing. Padding it with "Week 2 (0
    // tasks)" makes a deliberate two-week plan look like a broken
    // four-week one.
    const p = groupPlanByWeek([
      task({ dueDate: day(0) }),
      task({ dueDate: day(21) }),
    ]);
    expect(p.weeks.map((w) => w.label)).toEqual(["Week 1", "Week 4"]);
  });
});

describe("tasks the grouping could lose", () => {
  it("keeps undated tasks instead of dropping them", () => {
    // Quietly losing a task because a date failed to parse is the exact
    // shape of bug this repo keeps finding: the total still looks
    // plausible and the work is simply gone.
    const p = groupPlanByWeek([
      task({ id: 1, dueDate: day(0) }),
      task({ id: 2, dueDate: null }),
    ]);
    expect(p.total).toBe(2);
    expect(p.weeks.at(-1)?.label).toBe("No date");
    expect(p.weeks.at(-1)?.items.map((i) => i.id)).toEqual([2]);
  });

  it("keeps a task whose date does not parse", () => {
    const p = groupPlanByWeek([task({ id: 9, dueDate: "not a date" })]);
    expect(p.total).toBe(1);
    expect(p.weeks[0].label).toBe("No date");
  });

  it("handles an empty plan without inventing a week", () => {
    const p = groupPlanByWeek([]);
    expect(p.weeks).toEqual([]);
    expect(p.total).toBe(0);
  });
});

describe("the totals", () => {
  it("counts every task, in every week", () => {
    const rows = [0, 8, 20].map((n) => task({ dueDate: day(n) }));
    const p = groupPlanByWeek(rows);
    const listed = p.weeks.reduce((n, w) => n + w.items.length, 0);
    expect(listed).toBe(p.total);
  });

  it("counts done separately from total", () => {
    const p = groupPlanByWeek([
      task({ dueDate: day(0), status: "done" }),
      task({ dueDate: day(1), status: "todo" }),
    ]);
    expect(p.total).toBe(2);
    expect(p.done).toBe(1);
  });

  it("sums minutes, treating a missing estimate as zero not NaN", () => {
    // NaN renders as "NaN hours", which is the kind of thing that makes
    // a whole screen untrustworthy.
    const p = groupPlanByWeek([
      task({ dueDate: day(0), estimatedMinutes: 45 }),
      task({ dueDate: day(1), estimatedMinutes: null }),
    ]);
    expect(p.totalMinutes).toBe(45);
    expect(Number.isNaN(p.totalMinutes)).toBe(false);
  });
});
