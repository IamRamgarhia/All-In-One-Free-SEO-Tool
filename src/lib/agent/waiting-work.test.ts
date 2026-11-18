import { describe, expect, it } from "vitest";
import { describeWaitingWork } from "./waiting-work";

const NOW = new Date("2026-11-19T00:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("describeWaitingWork", () => {
  it("says nothing when nothing is waiting", () => {
    // A fresh install has an empty queue. "0 changes are waiting" on the
    // first screen somebody sees is noise, not information.
    expect(describeWaitingWork({ queued: 0, oldest: null }, NOW)).toBeNull();
  });

  it("reports the real case this was written for", () => {
    // 14 queued, oldest from late September — the measured state of a
    // live install whose autonomy level had never been chosen.
    expect(
      describeWaitingWork({ queued: 14, oldest: daysAgo(56) }, NOW),
    ).toBe("14 changes have been waiting for 8 weeks.");
  });

  it("uses the singular throughout for one change", () => {
    expect(describeWaitingWork({ queued: 1, oldest: daysAgo(1) }, NOW)).toBe(
      "1 change has been waiting since yesterday.",
    );
    expect(describeWaitingWork({ queued: 1, oldest: daysAgo(7) }, NOW)).toBe(
      "1 change has been waiting for 7 days.",
    );
  });

  it("says one week, not 1 weeks", () => {
    expect(describeWaitingWork({ queued: 3, oldest: daysAgo(14) }, NOW)).toBe(
      "3 changes have been waiting for 2 weeks.",
    );
    expect(describeWaitingWork({ queued: 3, oldest: daysAgo(21) }, NOW)).toBe(
      "3 changes have been waiting for 3 weeks.",
    );
  });

  it("switches to months past the point where weeks stop reading", () => {
    expect(describeWaitingWork({ queued: 9, oldest: daysAgo(90) }, NOW)).toBe(
      "9 changes have been waiting for 3 months.",
    );
    expect(describeWaitingWork({ queued: 9, oldest: daysAgo(31) }, NOW)).toBe(
      "9 changes have been waiting for 4 weeks.",
    );
  });

  it("does not say 0 days for something found this morning", () => {
    const text = describeWaitingWork({ queued: 2, oldest: daysAgo(0) }, NOW);
    expect(text).toBe("2 changes are already waiting, found today.");
    expect(text).not.toContain("0 days");
  });

  it("copes with a count but no timestamp", () => {
    // created_at is NOT NULL, but a hand-edited or migrated row could
    // still arrive without one, and the prompt must not render "NaN".
    const text = describeWaitingWork({ queued: 5, oldest: null }, NOW);
    expect(text).toBe("5 changes are waiting for an answer.");
    expect(text).not.toMatch(/NaN|Invalid/);
  });
});
