import { describe, expect, it } from "vitest";
import { summariseSweep } from "./sweep-summary";

/**
 * The line a person reads to decide whether the automation is working.
 *
 * It has to distinguish three things the scheduler itself cannot: every
 * check ran, some could not, and there was nothing to do. The middle one
 * is the case that went unreported for months.
 */
describe("summarising a sweep", () => {
  it("says so plainly when everything ran", () => {
    const s = summariseSweep([{ ok: true }, { ok: true }]);
    expect(s).toBe("2 of 2 checks ran");
    expect(s).not.toMatch(/could not/);
  });

  it("names the count that did not run", () => {
    // The number that matters. A sweep that reached two checks of ten is
    // not a sweep, and the whole point of this line is that it stops
    // reading like one.
    expect(summariseSweep([{ ok: true }, { ok: false }, { ok: false }])).toBe(
      "1 of 3 checks ran — 2 could not",
    );
  });

  it("says nothing when there was nothing to sweep", () => {
    // An install with no clients. "0 of 0 checks ran" reads as a broken
    // runner; silence is the honest answer.
    expect(summariseSweep([])).toBeNull();
  });

  it("says nothing rather than guessing about an unexpected result", () => {
    for (const r of [null, undefined, "done", 7, { ok: true }]) {
      expect(summariseSweep(r), JSON.stringify(r) ?? "undefined").toBeNull();
    }
  });

  it("ignores entries that are not outcomes", () => {
    // Defensive, because a wrong denominator here is a number a person
    // would act on.
    expect(summariseSweep([{ ok: true }, null, "x", { ok: false }])).toBe(
      "1 of 2 checks ran — 1 could not",
    );
  });
});
