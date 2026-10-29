/**
 * The support tracker reads a JSON file off the internet and renders numbers
 * from it, which puts it squarely under this project's first standing rule:
 * anything that reads a third party needs a fixture test, because the failure
 * is silent. A tracker showing "₹NaN received from null supporters" throws
 * nothing and looks, at a glance, like data.
 *
 * So the tests below are mostly about rubbish input. The committed
 * `supporters.json` is also parsed here, so a typo in the file the maintainer
 * hand-edits fails the build instead of blanking the panel in production.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_SLUG } from "./repo";
import {
  SNOOZE_DAYS,
  SUPPORTERS_URL,
  SUPPORT_NUDGE_MIN_AUDITS,
  formatRupees,
  goalPercent,
  localDay,
  nudgeLine,
  parseSupporters,
  shouldShowSupportNudge,
  snoozeUntil,
  upiNote,
} from "./supporters";

const GOOD = {
  currency: "INR",
  totalReceived: 2500,
  supporters: 7,
  goal: { amount: 30000, label: "A paid SERP API" },
  thanks: ["Asha Rao", "Kuldeep Suthar"],
  updated: "2026-10-29",
};

describe("SUPPORTERS_URL", () => {
  it("is built from the one slug this repo keeps, not a second copy", () => {
    // Rule four: the slug was hardcoded in 20 places once, 7 of them wrong.
    expect(SUPPORTERS_URL).toBe(
      `https://raw.githubusercontent.com/${REPO_SLUG}/main/supporters.json`,
    );
  });
});

describe("the committed supporters.json", () => {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "supporters.json"), "utf8"),
  ) as unknown;

  it("parses, so a hand-edit cannot silently blank the panel", () => {
    expect(parseSupporters(raw)).not.toBeNull();
  });

  it("explains to the maintainer how to edit it", () => {
    // Without this the next person to touch it has to read the parser.
    const obj = raw as Record<string, unknown>;
    expect(typeof obj._how).toBe("string");
    expect(String(obj._how).length).toBeGreaterThan(80);
  });

  it("carries a date in the form the parser accepts", () => {
    expect(parseSupporters(raw)?.updated).not.toBe("");
  });
});

describe("parseSupporters", () => {
  it("reads a well-formed file", () => {
    expect(parseSupporters(GOOD)).toEqual({
      totalReceived: 2500,
      supporters: 7,
      goal: { amount: 30000, label: "A paid SERP API" },
      thanks: ["Asha Rao", "Kuldeep Suthar"],
      updated: "2026-10-29",
    });
  });

  it("returns null for anything that is not an object", () => {
    for (const bad of [null, undefined, 0, "", "nope", [], [GOOD], true]) {
      expect(parseSupporters(bad), JSON.stringify(bad) ?? "undefined").toBeNull();
    }
  });

  it("returns null without a usable total, rather than showing NaN or a bare 0", () => {
    // `null`, `""` and `[]` all coerce to 0 through Number(), which would
    // render "₹0 received so far" from a file that never said so. Absent is
    // not zero.
    for (const total of [undefined, null, "", "   ", [], {}, true, "lots", NaN, Infinity, -1, 1e11]) {
      expect(
        parseSupporters({ ...GOOD, totalReceived: total }),
        JSON.stringify(total) ?? "undefined",
      ).toBeNull();
    }
  });

  it("drops a bad supporter count instead of the whole file", () => {
    // The total is the only required field; everything else degrades.
    expect(parseSupporters({ ...GOOD, supporters: "seven" })?.supporters).toBeNull();
    expect(parseSupporters({ ...GOOD, supporters: -3 })?.supporters).toBeNull();
    expect(parseSupporters({ ...GOOD, supporters: 7.9 })?.supporters).toBe(7);
  });

  it("drops a goal with no usable amount", () => {
    expect(parseSupporters({ ...GOOD, goal: { label: "no amount" } })?.goal).toBeNull();
    expect(parseSupporters({ ...GOOD, goal: { amount: 0 } })?.goal).toBeNull();
    expect(parseSupporters({ ...GOOD, goal: "soon" })?.goal).toBeNull();
    expect(parseSupporters({ ...GOOD, goal: [1, 2] })?.goal).toBeNull();
  });

  it("truncates a goal label rather than letting it run across the card", () => {
    const long = "x".repeat(400);
    expect(parseSupporters({ ...GOOD, goal: { amount: 100, label: long } })?.goal?.label)
      .toHaveLength(80);
  });

  it("keeps only real names, each one short", () => {
    const t = parseSupporters({
      ...GOOD,
      thanks: ["  Asha   Rao  ", "", "   ", 42, null, { name: "x" }, "y".repeat(200)],
    });
    expect(t?.thanks).toEqual(["Asha Rao", "y".repeat(60)]);
  });

  it("survives thanks being the wrong shape entirely", () => {
    expect(parseSupporters({ ...GOOD, thanks: "Asha" })?.thanks).toEqual([]);
    expect(parseSupporters({ ...GOOD, thanks: null })?.thanks).toEqual([]);
  });

  it("caps the list, so a huge file cannot hang the page", () => {
    const many = Array.from({ length: 5000 }, (_, i) => `Name ${i}`);
    const t = parseSupporters({ ...GOOD, thanks: many });
    expect(t?.thanks).toHaveLength(2000);
    // Keeps the END of the list: the file appends, so newest are last.
    expect(t?.thanks.at(-1)).toBe("Name 4999");
  });

  it("refuses a date that is not YYYY-MM-DD", () => {
    for (const d of ["29-10-2026", "2026/10/29", "today", "", null, 20261029]) {
      expect(parseSupporters({ ...GOOD, updated: d })?.updated, String(d)).toBe("");
    }
  });

  it("accepts a zero total, which is how a new tracker starts", () => {
    expect(parseSupporters({ ...GOOD, totalReceived: 0 })?.totalReceived).toBe(0);
  });
});

describe("upiNote", () => {
  it("carries the payer's name so the maintainer knows who paid", () => {
    expect(upiNote("Kaveri Digital")).toBe("SEO Tool support - Kaveri Digital");
  });

  it("falls back to a plain note with no name", () => {
    for (const n of ["", "   ", undefined]) {
      expect(upiNote(n)).toBe("SEO Tool support");
    }
  });

  it("strips what UPI apps reject outright", () => {
    // Some apps refuse the whole payment on an unexpected character, which
    // would look to the user like the app being broken.
    expect(upiNote("Acme & Co. (Pvt) Ltd #1")).toBe("SEO Tool support - Acme Co. Pvt Ltd 1");
    expect(upiNote("a@b/c?d=e")).toBe("SEO Tool support - a b c d e");
  });

  it("never exceeds the 50 characters every app accepts", () => {
    const note = upiNote("A Very Long Business Name That Goes On And On Forever");
    expect(note.length).toBeLessThanOrEqual(50);
    expect(note.startsWith("SEO Tool support - ")).toBe(true);
  });

  it("drops a name that is only punctuation", () => {
    expect(upiNote("!!! ???")).toBe("SEO Tool support");
  });
});

describe("formatRupees", () => {
  it("groups the Indian way", () => {
    expect(formatRupees(100000)).toBe("₹1,00,000");
    expect(formatRupees(2500)).toBe("₹2,500");
    expect(formatRupees(0)).toBe("₹0");
  });
});

describe("goalPercent", () => {
  it("measures progress", () => {
    expect(goalPercent(7500, 30000)).toBe(25);
  });

  it("clamps an overshoot to full rather than overflowing the bar", () => {
    expect(goalPercent(40000, 30000)).toBe(100);
  });

  it("returns 0 for a goal of zero instead of dividing by it", () => {
    expect(goalPercent(100, 0)).toBe(0);
    expect(goalPercent(100, -5)).toBe(0);
  });
});

describe("shouldShowSupportNudge", () => {
  const now = new Date("2026-10-29T10:00:00");

  it("stays quiet until the tool has actually done something", () => {
    // Asking for money before delivering any value is both rude and
    // unconvincing, and it is the state every fresh install is in.
    expect(shouldShowSupportNudge(0, {}, now)).toBe(false);
    expect(shouldShowSupportNudge(SUPPORT_NUDGE_MIN_AUDITS - 1, {}, now)).toBe(false);
    expect(shouldShowSupportNudge(SUPPORT_NUDGE_MIN_AUDITS, {}, now)).toBe(true);
  });

  it("ignores a nonsense count", () => {
    // Both are "we do not know how much this install has done", and the
    // answer to not knowing is to stay quiet.
    expect(shouldShowSupportNudge(NaN, {}, now)).toBe(false);
    expect(shouldShowSupportNudge(Infinity, {}, now)).toBe(false);
  });

  it("honours 'not today' for exactly that day", () => {
    const state = { hiddenOn: localDay(now) };
    expect(shouldShowSupportNudge(50, state, now)).toBe(false);
    const tomorrow = new Date("2026-10-30T09:00:00");
    expect(shouldShowSupportNudge(50, state, tomorrow)).toBe(true);
  });

  it("honours a 30-day snooze, and comes back after it", () => {
    const state = { snoozedUntil: snoozeUntil(now) };
    expect(shouldShowSupportNudge(50, state, now)).toBe(false);
    const during = new Date(now.getTime() + 29 * 86_400_000);
    expect(shouldShowSupportNudge(50, state, during)).toBe(false);
    const after = new Date(now.getTime() + (SNOOZE_DAYS + 1) * 86_400_000);
    expect(shouldShowSupportNudge(50, state, after)).toBe(true);
  });

  it("honours never, permanently", () => {
    const state = { never: true };
    expect(shouldShowSupportNudge(50, state, now)).toBe(false);
    const muchLater = new Date(now.getTime() + 400 * 86_400_000);
    expect(shouldShowSupportNudge(50, state, muchLater)).toBe(false);
  });

  it("is not confused by junk in the stored state", () => {
    expect(shouldShowSupportNudge(50, { snoozedUntil: NaN }, now)).toBe(true);
    expect(shouldShowSupportNudge(50, { snoozedUntil: undefined }, now)).toBe(true);
  });
});

describe("localDay", () => {
  it("uses the local calendar date, not UTC", () => {
    // Late evening in Asia/Kolkata is still "today" to the user even though
    // UTC has not rolled over. Getting this wrong means the card returns
    // hours after someone dismissed it.
    expect(localDay(new Date(2026, 9, 29, 23, 30))).toBe("2026-10-29");
    expect(localDay(new Date(2026, 0, 5, 0, 15))).toBe("2026-01-05");
  });
});

describe("nudgeLine", () => {
  it("is stable within a day, so it does not change under the reader", () => {
    const a = new Date("2026-10-29T08:00:00Z");
    const b = new Date("2026-10-29T20:00:00Z");
    expect(nudgeLine(a)).toBe(nudgeLine(b));
  });

  it("changes between days", () => {
    const lines = new Set(
      Array.from({ length: 4 }, (_, i) =>
        nudgeLine(new Date(Date.UTC(2026, 9, 29 + i))),
      ),
    );
    expect(lines.size).toBeGreaterThan(1);
  });

  it("never mentions a paid tier, because there isn't one", () => {
    for (let i = 0; i < 8; i++) {
      const line = nudgeLine(new Date(Date.UTC(2026, 9, 1 + i)));
      expect(line.length).toBeGreaterThan(20);
      expect(line.toLowerCase()).not.toMatch(/upgrade|pro plan|premium|trial/);
    }
  });
});
