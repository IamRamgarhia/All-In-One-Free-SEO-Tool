/**
 * Turning an approved plan into scheduled work.
 *
 * Both rules here fail quietly. A due date computed from the wrong start
 * puts week one overdue on the day it is created, which trains somebody
 * to ignore the overdue count entirely. A week label the parser cannot
 * read silently reschedules that week to wherever it happens to sit in
 * the list.
 *
 * `materialisePlan` and `planProgress` talk to the database and are
 * exercised against real rows separately; these are the rules they use.
 */

import { describe, expect, it } from "vitest";
import { planRef, weekDueDate, weekNumberFrom } from "./plan-tasks";

describe("planRef", () => {
  it("names the proposal and the week", () => {
    // The whole idempotency guarantee rests on this string. Two
    // proposals for one client must not collide, or re-sending the
    // second would look like the first was already expanded.
    expect(planRef(7, 0)).toBe("plan:7:0");
    expect(planRef(7, 5)).not.toBe(planRef(8, 5));
    expect(planRef(7, 5)).not.toBe(planRef(7, 6));
  });
});

describe("weekNumberFrom", () => {
  it("reads the number out of an ordinary label", () => {
    // "Week 1" is the first week, index 0.
    expect(weekNumberFrom("Week 1", 99)).toBe(0);
    expect(weekNumberFrom("Week 6", 99)).toBe(5);
  });

  it("takes the first number from a range", () => {
    // "Weeks 2-3" starts in week 2. Scheduling it to week 3 would make
    // it late from the moment it is created.
    expect(weekNumberFrom("Weeks 2-3", 99)).toBe(1);
  });

  it("falls back to the position when there is no number", () => {
    // A plan whose labels are reworded must not silently reschedule
    // itself to week zero.
    expect(weekNumberFrom("Kickoff", 4)).toBe(4);
    expect(weekNumberFrom("", 2)).toBe(2);
  });

  it("treats week zero as the position rather than a negative index", () => {
    // "Week 0" would otherwise compute index -1 and land the due date
    // before the plan started.
    expect(weekNumberFrom("Week 0", 3)).toBe(3);
  });
});

describe("weekDueDate", () => {
  const start = new Date("2026-09-01T00:00:00Z");

  it("gives week one until the end of week one", () => {
    // Due at the END of the week, not the start. Otherwise every task
    // is overdue on the day it appears, and an overdue count that is
    // always wrong is one nobody reads.
    const due = weekDueDate(start, 0);
    expect(due.getTime()).toBeGreaterThan(start.getTime());
    expect(Math.round((due.getTime() - start.getTime()) / 86_400_000)).toBe(7);
  });

  it("spaces weeks a week apart", () => {
    const w1 = weekDueDate(start, 0);
    const w2 = weekDueDate(start, 1);
    expect(Math.round((w2.getTime() - w1.getTime()) / 86_400_000)).toBe(7);
  });

  it("counts from the day the plan was sent", () => {
    // Not from when it was drafted. A proposal written on Monday and
    // sent on Friday starts on Friday, because that is when the client
    // agreed and when they start counting.
    const later = new Date("2026-09-05T00:00:00Z");
    expect(weekDueDate(later, 0).getTime()).toBeGreaterThan(
      weekDueDate(start, 0).getTime(),
    );
  });

  it("does not mutate the date it was given", () => {
    // setDate mutates in place, and a shared start date walking forward
    // one week per task would schedule a thirteen-week plan across a
    // year.
    const original = new Date(start);
    weekDueDate(start, 5);
    expect(start.getTime()).toBe(original.getTime());
  });
});
