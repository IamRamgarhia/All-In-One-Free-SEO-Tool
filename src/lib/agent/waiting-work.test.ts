import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { describeWaitingWork, type WaitingDescription } from "./waiting-work";

const NOW = new Date("2026-11-19T00:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

/** Renders the sentence the autonomy prompt shows, in one language. */
function render(locale: "en" | "fr", d: WaitingDescription | null): string | null {
  if (!d) return null;
  const t = createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace: "dashboard.autonomy.waiting",
  });
  const n = "n" in d.age ? d.age.n : 0;
  return t(d.age.unit, { count: d.count, n });
}
const enOf = (queued: number, oldest: Date | null) =>
  render("en", describeWaitingWork({ queued, oldest }, NOW));
const frOf = (queued: number, oldest: Date | null) =>
  render("fr", describeWaitingWork({ queued, oldest }, NOW));

describe("describeWaitingWork", () => {
  it("says nothing when nothing is waiting", () => {
    // A fresh install has an empty queue. "0 changes are waiting" on the
    // first screen somebody sees is noise, not information.
    expect(describeWaitingWork({ queued: 0, oldest: null }, NOW)).toBeNull();
  });

  it("reports the real case this was written for", () => {
    // 14 queued, oldest from late September — the measured state of a
    // live install whose autonomy level had never been chosen.
    expect(enOf(14, daysAgo(56))).toBe("14 changes have been waiting for 8 weeks.");
    expect(frOf(14, daysAgo(56))).toBe("14 modifications attendent depuis 8 semaines.");
  });

  it("uses the singular throughout for one change", () => {
    expect(enOf(1, daysAgo(1))).toBe("1 change has been waiting since yesterday.");
    expect(enOf(1, daysAgo(7))).toBe("1 change has been waiting for 7 days.");
    expect(frOf(1, daysAgo(1))).toBe("1 modification attend depuis hier.");
    expect(frOf(1, daysAgo(7))).toBe("1 modification attend depuis 7 jours.");
  });

  it("says two weeks, not 14 days", () => {
    expect(enOf(3, daysAgo(14))).toBe("3 changes have been waiting for 2 weeks.");
    expect(enOf(3, daysAgo(21))).toBe("3 changes have been waiting for 3 weeks.");
    expect(frOf(3, daysAgo(14))).toBe("3 modifications attendent depuis 2 semaines.");
  });

  it("switches to months past the point where weeks stop reading", () => {
    expect(enOf(9, daysAgo(90))).toBe("9 changes have been waiting for 3 months.");
    expect(enOf(9, daysAgo(31))).toBe("9 changes have been waiting for 4 weeks.");
    expect(frOf(9, daysAgo(90))).toBe("9 modifications attendent depuis 3 mois.");
  });

  it("does not say 0 days for something found this morning", () => {
    const text = enOf(2, daysAgo(0));
    expect(text).toBe("2 changes are already waiting, found today.");
    expect(text).not.toContain("0 days");
    expect(frOf(2, daysAgo(0))).toBe("2 modifications attendent déjà, trouvées aujourd’hui.");
  });

  it("copes with a count but no timestamp", () => {
    // created_at is NOT NULL, but a hand-edited or migrated row could
    // still arrive without one, and the prompt must not render "NaN".
    const text = enOf(5, null);
    expect(text).toBe("5 changes are waiting for an answer.");
    expect(text).not.toMatch(/NaN|Invalid/);
    expect(frOf(5, null)).toBe("5 modifications attendent une réponse.");
  });
});
