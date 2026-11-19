import { describe, expect, it } from "vitest";
import { summariseSweep, sweepDegraded } from "./sweep-summary";

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

describe("sweepDegraded — the signal the green tick needed", () => {
  /*
   * A sweep that reaches nothing returns normally, so the scheduler
   * records a success and the Automations view drew a green CheckCircle2
   * beside "27 of 38 checks ran — 11 could not" — measured on a real
   * install, on the same row. The note was added precisely because a
   * green tick "is what let the sweep report success for months while
   * reaching nothing", and then the tick stayed green.
   *
   * This is the boolean the icon reads. Computed from the result, never
   * by parsing that sentence: a regex over human copy would be a second
   * source of truth about whether the work happened, and the two would
   * drift the first time the wording improved.
   */
  it("any failed check makes the run degraded", () => {
    expect(sweepDegraded([{ ok: true }, { ok: false }, { ok: true }])).toBe(true);
  });

  it("all passing is not degraded", () => {
    expect(sweepDegraded([{ ok: true }, { ok: true }])).toBe(false);
  });

  it("no checks at all is not degraded", () => {
    // There were no clients to sweep. summariseSweep already reports
    // that as nothing rather than as a failure, and an amber icon on a
    // fresh install with no clients would be alarming and wrong.
    expect(sweepDegraded([])).toBe(false);
  });

  it("a malformed result is not degraded, and does not throw", () => {
    for (const bad of [null, undefined, "x", 42, {}, [{}], [{ ok: "yes" }]]) {
      expect(sweepDegraded(bad)).toBe(false);
    }
  });

  it("agrees with the sentence summariseSweep writes", () => {
    // The two are computed independently and must not disagree: an amber
    // icon over "38 of 38 checks ran" would be as confusing as the green
    // tick this replaces.
    const cases: unknown[] = [
      [{ ok: true }, { ok: true }],
      [{ ok: true }, { ok: false }],
      [{ ok: false }],
      [],
    ];
    for (const c of cases) {
      const note = summariseSweep(c);
      const degraded = sweepDegraded(c);
      if (note && note.includes("could not")) {
        expect(degraded, `"${note}" should be degraded`).toBe(true);
      } else {
        expect(degraded, `"${note}" should not be degraded`).toBe(false);
      }
    }
  });
});
