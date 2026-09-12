/**
 * The review queue, and the two claims it must never make falsely.
 *
 * The first: "we replied to this". A reply live on Google may have been
 * typed by the owner in Google's own app. If the tool counts that as its
 * own work, a monthly report credits it with replies it never wrote, and
 * nobody can check because the evidence is the same field.
 *
 * The second: "everything is answered". The queue is built from what we
 * have stored, and a sync that only read the first fifty reviews knows
 * nothing about the rest. If it were allowed to mark the unseen ones as
 * deleted, the queue would empty itself and report a clean slate.
 *
 * Both failures are silent, both look like success, and both are the
 * shape this codebase keeps finding.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, gbpReviews } from "@/db/schema";

const fetchAllGbpReviews = vi.fn();
const replyToGbpReview = vi.fn();
vi.mock("./gbp-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gbp-api")>();
  return {
    ...actual,
    fetchAllGbpReviews: (...a: unknown[]) => fetchAllGbpReviews(...a),
    replyToGbpReview: (...a: unknown[]) => replyToGbpReview(...a),
  };
});

const {
  listReviewQueue,
  reviewCounts,
  saveDraftReply,
  sendAllDrafts,
  sendReply,
  syncGbpReviews,
} = await import("./gbp-review-queue");

const LOCATION = "accounts/1/locations/2";

function review(over: Partial<Record<string, unknown>> = {}) {
  return {
    reviewId: "r1",
    reviewer: { displayName: "Asha Kumar" },
    starRating: 5,
    comment: "Quick turnaround and the tape held.",
    createTime: "2026-09-01T10:00:00Z",
    updateTime: "2026-09-01T10:00:00Z",
    reply: null,
    ...over,
  };
}

function fetched(reviews: unknown[], complete = true) {
  fetchAllGbpReviews.mockResolvedValue({
    reviews,
    complete,
    averageRating: 4.5,
    totalReviewCount: reviews.length,
  });
}

let clientId = 0;

beforeEach(async () => {
  fetchAllGbpReviews.mockReset();
  replyToGbpReview.mockReset();
  const [row] = await db
    .insert(clients)
    .values({ name: "Prateek Tapes", url: "https://prateektapes.com" })
    .returning({ id: clients.id });
  clientId = row.id;
});

afterEach(async () => {
  await db.delete(clients).where(eq(clients.id, clientId));
});

describe("syncing", () => {
  it("stores what it fetched", async () => {
    fetched([review(), review({ reviewId: "r2", starRating: 2, comment: "Late." })]);
    const out = await syncGbpReviews({ clientId, locationName: LOCATION });
    expect(out.added).toBe(2);
    expect(out.seen).toBe(2);
    const rows = await db.select().from(gbpReviews).where(eq(gbpReviews.clientId, clientId));
    expect(rows).toHaveLength(2);
  });

  it("updates rather than duplicating on a second sync", async () => {
    fetched([review()]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    fetched([review({ comment: "Edited: still good." })]);
    const out = await syncGbpReviews({ clientId, locationName: LOCATION });
    expect(out.added).toBe(0);
    expect(out.updated).toBe(1);
    const rows = await db.select().from(gbpReviews).where(eq(gbpReviews.clientId, clientId));
    expect(rows).toHaveLength(1);
    expect(rows[0].comment).toBe("Edited: still good.");
  });

  it("marks a vanished review as gone when it read to the end", async () => {
    fetched([review(), review({ reviewId: "r2" })]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    fetched([review()]);
    const out = await syncGbpReviews({ clientId, locationName: LOCATION });
    expect(out.removed).toBe(1);
  });

  it("REFUSES to mark anything gone from a partial fetch", async () => {
    // The queue-emptying bug. A fetch that stopped at the page cap knows
    // nothing about the rest, and treating "not on the page I read" as
    // "deleted" would clear the backlog and report a clean slate.
    fetched([review(), review({ reviewId: "r2" })]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    fetched([review()], false);
    const out = await syncGbpReviews({ clientId, locationName: LOCATION });
    expect(out.removed).toBe(0);
    expect(out.complete).toBe(false);
  });

  it("keeps the row when a review comes back", async () => {
    fetched([review()]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    fetched([]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    fetched([review()]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    const [row] = await db.select().from(gbpReviews).where(eq(gbpReviews.clientId, clientId));
    expect(row.removedAt).toBeNull();
  });

  it("survives a review with no rating and no text", async () => {
    fetched([review({ starRating: null, comment: null })]);
    const out = await syncGbpReviews({ clientId, locationName: LOCATION });
    expect(out.added).toBe(1);
  });
});

describe("telling our replies from everyone else's", () => {
  it("does not count a reply written in Google's own app as ours", async () => {
    // The credit-taking bug. This reply exists and we did not write it.
    fetched([
      review({
        reply: { comment: "Thanks Asha!", updateTime: "2026-09-02T09:00:00Z" },
      }),
    ]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    const counts = await reviewCounts(clientId);
    expect(counts.unanswered).toBe(0);
    expect(counts.answeredElsewhere).toBe(1);
    expect(counts.sentByUs).toBe(0);
  });

  it("counts a reply we sent as ours", async () => {
    fetched([review()]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    replyToGbpReview.mockResolvedValue({ ok: true });
    await sendReply({ clientId, reviewId: "r1", text: "Thank you Asha." });
    const counts = await reviewCounts(clientId);
    expect(counts.sentByUs).toBe(1);
    expect(counts.answeredElsewhere).toBe(0);
  });
});

describe("the queue", () => {
  beforeEach(async () => {
    fetched([
      review({ reviewId: "good", starRating: 5, createTime: "2026-09-05T00:00:00Z" }),
      review({ reviewId: "angry", starRating: 1, createTime: "2026-08-01T00:00:00Z" }),
      review({ reviewId: "middling", starRating: 3, createTime: "2026-09-04T00:00:00Z" }),
      review({
        reviewId: "answered",
        starRating: 4,
        reply: { comment: "Thanks", updateTime: "2026-09-06T00:00:00Z" },
      }),
    ]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
  });

  it("puts the angriest unanswered review first", async () => {
    // A one-star sitting unanswered costs more than a five-star, and a
    // queue sorted by date alone buries it under every newer review.
    const q = await listReviewQueue({ clientId });
    expect(q[0].reviewId).toBe("angry");
  });

  it("leaves out anything already answered, by anyone", async () => {
    const q = await listReviewQueue({ clientId });
    expect(q.map((r) => r.reviewId)).not.toContain("answered");
  });

  it("counts the negative backlog separately", async () => {
    // The number a business owner actually needs to see.
    const counts = await reviewCounts(clientId);
    expect(counts.unanswered).toBe(3);
    expect(counts.unansweredNegative).toBe(2);
  });

  it("reports the average of what it holds", async () => {
    const counts = await reviewCounts(clientId);
    expect(counts.averageRating).toBe(3.3);
  });
});

describe("drafts", () => {
  beforeEach(async () => {
    fetched([review()]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
  });

  it("survives being stored and read back", async () => {
    await saveDraftReply({ clientId, reviewId: "r1", text: "Thanks Asha." });
    const q = await listReviewQueue({ clientId, filter: "drafted" });
    expect(q).toHaveLength(1);
    expect(q[0].draftReply).toBe("Thanks Asha.");
  });

  it("is cleared once the reply is on Google", async () => {
    await saveDraftReply({ clientId, reviewId: "r1", text: "Thanks Asha." });
    replyToGbpReview.mockResolvedValue({ ok: true });
    await sendReply({ clientId, reviewId: "r1", text: "Thanks Asha." });
    const [row] = await db.select().from(gbpReviews).where(eq(gbpReviews.clientId, clientId));
    expect(row.draftReply).toBeNull();
    expect(row.sentAt).not.toBeNull();
  });
});

describe("sending", () => {
  beforeEach(async () => {
    fetched([review()]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
  });

  it("records nothing when Google rejects it", async () => {
    // The claim that matters. Recording the send first and hoping is how
    // a tool reports replies it never delivered.
    replyToGbpReview.mockResolvedValue({ ok: false, error: "403 insufficient scope" });
    const res = await sendReply({ clientId, reviewId: "r1", text: "Thanks." });
    expect(res.ok).toBe(false);
    const [row] = await db.select().from(gbpReviews).where(eq(gbpReviews.clientId, clientId));
    expect(row.sentAt).toBeNull();
    expect(row.replyComment).toBeNull();
  });

  it("refuses an empty reply", async () => {
    const res = await sendReply({ clientId, reviewId: "r1", text: "   " });
    expect(res.ok).toBe(false);
    expect(replyToGbpReview).not.toHaveBeenCalled();
  });

  it("refuses a review that is no longer on Google", async () => {
    fetched([]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    const res = await sendReply({ clientId, reviewId: "r1", text: "Thanks." });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no longer/i);
  });

  it("stops a batch after two failures that are the same problem", async () => {
    // Twenty consecutive auth failures are one problem reported twenty
    // times, and each one costs a request.
    fetched([
      review({ reviewId: "a" }),
      review({ reviewId: "b" }),
      review({ reviewId: "c" }),
      review({ reviewId: "d" }),
    ]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    for (const id of ["a", "b", "c", "d"]) {
      await saveDraftReply({ clientId, reviewId: id, text: "Thanks." });
    }
    replyToGbpReview.mockResolvedValue({ ok: false, error: "403 insufficient scope" });

    const out = await sendAllDrafts({ clientId });
    expect(out.sent).toBe(0);
    expect(out.failed.length).toBe(2);
    expect(replyToGbpReview).toHaveBeenCalledTimes(2);
  });

  it("keeps going when a failure is specific to one review", async () => {
    // The mirror. One rejected reply must not abandon the other nine.
    fetched([review({ reviewId: "a" }), review({ reviewId: "b" })]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    await saveDraftReply({ clientId, reviewId: "a", text: "Thanks." });
    await saveDraftReply({ clientId, reviewId: "b", text: "Thanks." });
    replyToGbpReview
      .mockResolvedValueOnce({ ok: false, error: "Reply too long" })
      .mockResolvedValueOnce({ ok: true });

    const out = await sendAllDrafts({ clientId });
    expect(out.sent).toBe(1);
    expect(out.failed).toHaveLength(1);
  });
});

describe("reviews go with the client", () => {
  it("leaves nothing behind", async () => {
    fetched([review()]);
    await syncGbpReviews({ clientId, locationName: LOCATION });
    await db.delete(clients).where(eq(clients.id, clientId));
    const rows = await db
      .select()
      .from(gbpReviews)
      .where(and(eq(gbpReviews.clientId, clientId)));
    expect(rows).toEqual([]);
  });
});
