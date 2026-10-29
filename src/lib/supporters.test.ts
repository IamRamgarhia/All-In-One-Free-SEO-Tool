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

  /**
   * Four fields have to agree — totalReceived, supporters, thanks and
   * people — and nothing about editing JSON by hand keeps them in step.
   * A page reading "2 supporters" above one name is wrong in the way
   * that costs trust, and it would never throw. scripts/add-supporter.ts
   * exists to keep these true; this is what catches it when someone
   * edits the file on GitHub instead.
   */
  it("never claims more supporters than it can account for, or fewer than it lists", () => {
    const t = parseSupporters(raw)!;
    const count = t.supporters ?? 0;
    expect(count).toBeGreaterThanOrEqual(t.people.length);
    expect(count).toBeGreaterThanOrEqual(t.thanks.length);
  });

  it("does not list payments adding up to more than the total received", () => {
    const t = parseSupporters(raw)!;
    const listed = t.people.reduce((sum, p) => sum + p.amount, 0);
    expect(listed).toBeLessThanOrEqual(t.totalReceived);
  });

  it("lists every named person in thanks too, so older installs still see them", () => {
    const t = parseSupporters(raw)!;
    for (const p of t.people) expect(t.thanks).toContain(p.name);
  });
});

describe("parseSupporters", () => {
  it("reads a well-formed file", () => {
    expect(parseSupporters(GOOD)).toEqual({
      totalReceived: 2500,
      supporters: 7,
      goal: { amount: 30000, label: "A paid SERP API" },
      thanks: ["Asha Rao", "Kuldeep Suthar"],
      people: [],
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

/**
 * `upiNote` existed, was tested here, and was wired into nothing — the
 * payment dialog built its own note inline and sent "Tip for DiceCodes",
 * so the string these tests guarded was not the string any payer ever
 * saw. A helper with tests and no caller is worse than no helper: it
 * reads as covered.
 *
 * This reads the dialog's source, which is the only way to catch that
 * from a unit test. If the note ever moves, point this at its new home
 * rather than deleting it.
 */
describe("the payment dialog uses the shared note", () => {
  const DIALOG = "src/components/shell/maintainer-credit.tsx";
  const src = readFileSync(join(process.cwd(), DIALOG), "utf8");

  it("calls upiNote() instead of composing its own", () => {
    expect(src).toMatch(/note:\s*upiNote\(/);
    expect(src).toMatch(/import\s*\{\s*upiNote\s*\}\s*from\s*"@\/lib\/supporters"/);
  });

  it("carries no second note string", () => {
    expect(src).not.toMatch(/Tip for/);
    // A bare `note:` with a template or quoted literal would be a
    // hand-rolled note slipping back in.
    expect(src).not.toMatch(/note:\s*[`'"]/);
  });

  it("offers a preset ladder from 100 to 1000", () => {
    const m = src.match(/PRESET_AMOUNTS\s*=\s*\[([^\]]+)\]/);
    expect(m).not.toBeNull();
    const presets = m![1].split(",").map((s) => Number(s.trim()));
    expect(presets.every(Number.isFinite)).toBe(true);
    expect(presets[0]).toBe(100);
    expect(presets[presets.length - 1]).toBe(1000);
    // Ascending, so the buttons read as a ladder rather than a jumble.
    expect([...presets].sort((a, b) => a - b)).toEqual(presets);
    expect(presets.length).toBeGreaterThanOrEqual(4);
  });

  it("renders the note on screen, so the payer can recognise the payment", () => {
    expect(src).toMatch(/\{upiNote\(/);
  });

  it("offers a field for the payer's name, which is how it reaches the note", () => {
    expect(src).toMatch(/upiNote\(payerName\)/);
    expect(src).toMatch(/setPayerName/);
  });
});

/**
 * `people` carries what each supporter gave. It arrives from the same
 * untrusted file as everything else here, and a row that renders as
 * "Someone — ₹0" is a payment nobody made, so a row missing either half
 * is dropped rather than shown with a hole in it.
 */
describe("parseSupporters: people", () => {
  const withPeople = (people: unknown) =>
    parseSupporters({ ...GOOD, people });

  it("keeps rows that have a name and an amount", () => {
    const t = withPeople([
      { name: "Kaveri Digital", amount: 501, date: "2026-10-29" },
      { name: "Asha Traders", amount: 101.4, date: "2026-10-28" },
    ]);
    expect(t!.people).toEqual([
      { name: "Kaveri Digital", amount: 501, date: "2026-10-29" },
      { name: "Asha Traders", amount: 101, date: "2026-10-28" },
    ]);
  });

  it("drops a row with no name, or no usable amount", () => {
    const t = withPeople([
      { name: "", amount: 500 },
      { name: "No amount" },
      { name: "Null amount", amount: null },
      { name: "Not a number", amount: "lots" },
      { name: "Negative", amount: -5 },
      { name: "Real", amount: 100 },
    ]);
    expect(t!.people.map((p) => p.name)).toEqual(["Real"]);
  });

  it("keeps a zero-rupee row out, but an absent amount too — they differ from a real ₹0", () => {
    // Number(null) is 0 and Number("") is 0. A row that reached the page
    // as ₹0 would read as a payment of nothing that someone made.
    expect(withPeople([{ name: "A", amount: null }])!.people).toEqual([]);
    expect(withPeople([{ name: "B", amount: "" }])!.people).toEqual([]);
    expect(withPeople([{ name: "C", amount: 0 }])!.people).toEqual([
      { name: "C", amount: 0, date: "" },
    ]);
  });

  it("drops a date that is not YYYY-MM-DD rather than showing it", () => {
    const t = withPeople([{ name: "A", amount: 1, date: "29/10/2026" }]);
    expect(t!.people[0]?.date).toBe("");
  });

  it("survives rubbish in place of the array", () => {
    for (const junk of [null, "nope", 7, {}, [1, "x", null, []]]) {
      expect(withPeople(junk)!.people).toEqual([]);
    }
  });

  it("is empty for a file written before the field existed", () => {
    expect(parseSupporters(GOOD)!.people).toEqual([]);
  });
});
