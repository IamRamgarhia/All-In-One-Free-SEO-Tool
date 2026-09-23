/**
 * The Business Profile rules, tested without a Business Profile.
 *
 * The scope this needs cannot be held by a service account, and a
 * service account is the only Google connection on this install. So the
 * network half is unproven and says so in its own header. The rules half
 * is pure and is tested properly here, which is the difference between
 * "unverified" and "unwritten".
 *
 * The signatures matter as much as the rules. They must not contain
 * counts or dates: a signature carrying "3 reviews" changes to "4
 * reviews" next week, and a finding somebody replied to would come back
 * as new rather than staying resolved.
 */

import { describe, expect, it } from "vitest";
import { gbpFindings, summariseGbp } from "./gbp-monitor";
import type { GbpReview } from "./gbp-api";

const NOW = Date.parse("2026-09-12T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function review(over: Partial<GbpReview> = {}): GbpReview {
  return {
    reviewId: Math.random().toString(36).slice(2),
    reviewer: { displayName: "A customer" },
    starRating: 5,
    comment: "Good.",
    createTime: daysAgo(3),
    updateTime: daysAgo(3),
    reply: null,
    ...over,
  };
}

const sigs = (f: ReturnType<typeof gbpFindings>) => f.map((x) => x.signature);

describe("unanswered reviews", () => {
  it("says nothing when every review has a reply", () => {
    const reviews = [
      review({ reply: { comment: "Thanks!", updateTime: daysAgo(2) } }),
      review({ starRating: 1, reply: { comment: "Sorry.", updateTime: daysAgo(1) } }),
    ];
    expect(gbpFindings({ reviews, profile: null, now: NOW })).toEqual([]);
  });

  it("leaves a review from this morning alone", () => {
    // Flagging a review an hour old turns the tool into a nag. The
    // playbook's own target is 48 hours; this fires at 24.
    const reviews = [review({ createTime: new Date(NOW - 3600_000).toISOString() })];
    expect(gbpFindings({ reviews, profile: null, now: NOW })).toEqual([]);
  });

  it("separates negative reviews from the rest", () => {
    // The whole point. Lumping a one-star in with four routine ones
    // buries the only one that is actually urgent.
    const reviews = [
      review({ starRating: 1 }),
      review({ starRating: 2 }),
      review({ starRating: 5 }),
      review({ starRating: 4 }),
    ];
    const f = gbpFindings({ reviews, profile: null, now: NOW });
    expect(sigs(f)).toEqual([
      "gbp.unanswered_low_rating",
      "gbp.unanswered_review",
    ]);
    expect(f[0].severity).toBe("high");
    expect(f[0].title).toContain("2");
    expect(f[1].severity).toBe("medium");
    expect(f[1].title).toContain("2");
  });

  it("does not double-count a negative review in the general finding", () => {
    const f = gbpFindings({
      reviews: [review({ starRating: 1 })],
      profile: null,
      now: NOW,
    });
    expect(sigs(f)).toEqual(["gbp.unanswered_low_rating"]);
  });

  it("treats an unparseable date as old rather than new", () => {
    // Fail toward showing the work. A review we cannot date is one
    // somebody should look at, not one to hide.
    const f = gbpFindings({
      reviews: [review({ createTime: "not a date" })],
      profile: null,
      now: NOW,
    });
    expect(sigs(f)).toContain("gbp.unanswered_review");
  });

  it("keeps signatures free of counts, so a reply resolves them", () => {
    const one = gbpFindings({ reviews: [review()], profile: null, now: NOW });
    const many = gbpFindings({
      reviews: [review(), review(), review()],
      profile: null,
      now: NOW,
    });
    expect(one[0].signature).toBe(many[0].signature);
    expect(one[0].signature).not.toMatch(/\d/);
  });
});

describe("profile completeness", () => {
  it("says nothing about a complete profile", () => {
    expect(
      gbpFindings({
        reviews: [],
        profile: {
          primaryCategory: "Web designer",
          primaryPhone: "+91 00000 00000",
          websiteUri: "https://example.com",
        },
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("names exactly what is missing", () => {
    const f = gbpFindings({
      reviews: [],
      profile: { primaryCategory: "Web designer", primaryPhone: "", websiteUri: null },
      now: NOW,
    });
    expect(f[0].title).toContain("phone number");
    expect(f[0].title).toContain("website link");
    expect(f[0].title).not.toContain("primary category");
  });

  it("treats a missing category as the worse one", () => {
    // Category decides which searches the business appears in at all.
    const noCat = gbpFindings({
      reviews: [],
      profile: { primaryCategory: null, primaryPhone: "1", websiteUri: "https://x.com" },
      now: NOW,
    });
    const noPhone = gbpFindings({
      reviews: [],
      profile: { primaryCategory: "Web designer", primaryPhone: null, websiteUri: "https://x.com" },
      now: NOW,
    });
    expect(noCat[0].severity).toBe("high");
    expect(noPhone[0].severity).toBe("medium");
  });

  it("says nothing when the profile could not be read", () => {
    // A failed read is not an empty profile. Reporting "missing
    // everything" because a request timed out would be a confident wrong
    // answer of exactly the kind this repo tests hardest against.
    expect(gbpFindings({ reviews: [], profile: null, now: NOW })).toEqual([]);
  });
});

describe("the line on the automations screen", () => {
  it("tells the user to connect OAuth when nothing can be reached", () => {
    expect(
      summariseGbp([
        { clientId: 1, ok: false, needsScope: true },
        { clientId: 2, ok: false, needsScope: true },
      ]),
    ).toMatch(/OAuth/);
  });

  it("counts what it checked when it could", () => {
    expect(
      summariseGbp([{ clientId: 1, ok: true, reviews: 4, findings: 2 }]),
    ).toBe("1 profile checked, 2 things to do");
  });

  it("says nothing rather than 0 of 0", () => {
    expect(summariseGbp([])).toBeNull();
    expect(summariseGbp(null)).toBeNull();
  });
});
