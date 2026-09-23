/**
 * The reviews on a business profile, and which of them still need an
 * answer.
 *
 * Reviews used to be fetched fresh on every page load and never kept.
 * That reads as working, and costs four things that only show up later:
 *
 *   - There is no queue. "Which ones still need answering" is recomputed
 *     from whatever fifty reviews the API happened to return, so it
 *     changes shape as reviews arrive and nobody can work through it.
 *   - There is no record that we answered. A monthly report cannot say
 *     "we replied to eleven reviews" because nothing knows we did.
 *   - A reply drafted and not yet sent dies on page reload.
 *   - Nothing else in the tool — the agent, a report, an assistant over
 *     MCP — can see any of it.
 *
 * THE DISTINCTION THAT MATTERS
 *
 * `replyComment` is whatever reply is live on Google right now. It may
 * have been typed by the owner in Google's own app, by an agency, or by
 * us. `sentAt` is set only when this tool sent it.
 *
 * Collapsing those into one "replied" flag would let the tool take
 * credit for somebody else's work, and would make "everything is
 * answered" a claim nobody can check. They stay separate everywhere,
 * including in what the UI says.
 */

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { gbpReviews, type GbpReviewRow } from "@/db/schema";
import {
  fetchAllGbpReviews,
  replyToGbpReview,
} from "./gbp-api";

/** A Google timestamp, or null rather than an Invalid Date. */
function when(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type SyncOutcome = {
  /** Reviews seen in this sync. */
  seen: number;
  added: number;
  updated: number;
  /** Marked gone. Always 0 when the fetch did not reach the end. */
  removed: number;
  /** Whether the fetch paged all the way to the end. */
  complete: boolean;
  averageRating: number | null;
  totalReviewCount: number | null;
};

/**
 * Pull every review for a location and reconcile it with what we hold.
 *
 * Never deletes a row. A review the reviewer removed keeps its record,
 * because the reply we sent is part of the account of what we did and
 * should not disappear with the thing it answered.
 */
export async function syncGbpReviews(opts: {
  clientId: number;
  locationName: string;
}): Promise<SyncOutcome> {
  const fetched = await fetchAllGbpReviews({
    locationName: opts.locationName,
    clientIdScope: opts.clientId,
  });

  const existing = await db
    .select()
    .from(gbpReviews)
    .where(eq(gbpReviews.clientId, opts.clientId));
  const byReviewId = new Map(existing.map((r) => [r.reviewId, r]));

  const now = new Date();
  let added = 0;
  let updated = 0;

  for (const r of fetched.reviews) {
    if (!r.reviewId) continue;
    const prior = byReviewId.get(r.reviewId);
    const fields = {
      locationName: opts.locationName,
      reviewerName: r.reviewer.displayName,
      reviewerPhotoUrl: r.reviewer.profilePhotoUrl ?? null,
      starRating: r.starRating,
      comment: r.comment,
      createTime: when(r.createTime),
      updateTime: when(r.updateTime),
      replyComment: r.reply?.comment ?? null,
      replyUpdateTime: when(r.reply?.updateTime),
      // Seen again, so it is not gone. A reviewer can delete and repost.
      removedAt: null,
      lastSyncedAt: now,
    };

    if (!prior) {
      await db
        .insert(gbpReviews)
        .values({ clientId: opts.clientId, reviewId: r.reviewId, ...fields });
      added++;
      continue;
    }

    // A reply that appeared on Google without us sending it was written
    // somewhere else — Google's own app, usually. Clearing our draft
    // then would be wrong: the user may still want to replace it. But
    // leaving it in the "needs answering" queue would be wrong too, and
    // the queue below keys off replyComment, so it leaves on its own.
    await db
      .update(gbpReviews)
      .set(fields)
      .where(eq(gbpReviews.id, prior.id));
    updated++;
  }

  // Only a fetch that reached the end may conclude anything is gone.
  let removed = 0;
  if (fetched.complete) {
    const seenIds = new Set(fetched.reviews.map((r) => r.reviewId));
    for (const prior of existing) {
      if (seenIds.has(prior.reviewId) || prior.removedAt) continue;
      await db
        .update(gbpReviews)
        .set({ removedAt: now, lastSyncedAt: now })
        .where(eq(gbpReviews.id, prior.id));
      removed++;
    }
  }

  return {
    seen: fetched.reviews.length,
    added,
    updated,
    removed,
    complete: fetched.complete,
    averageRating: fetched.averageRating,
    totalReviewCount: fetched.totalReviewCount,
  };
}

export type ReviewQueueCounts = {
  total: number;
  /** No reply on Google, from anyone. */
  unanswered: number;
  /** Unanswered and we have written something, not yet sent. */
  drafted: number;
  /** Replies this tool sent. */
  sentByUs: number;
  /** Answered, but not by us. */
  answeredElsewhere: number;
  /** Unanswered and rated 3 or below. These are the urgent ones. */
  unansweredNegative: number;
  averageRating: number | null;
};

export async function reviewCounts(clientId: number): Promise<ReviewQueueCounts> {
  const rows = await db
    .select()
    .from(gbpReviews)
    .where(and(eq(gbpReviews.clientId, clientId), isNull(gbpReviews.removedAt)));

  const rated = rows.filter((r) => typeof r.starRating === "number");
  const unanswered = rows.filter((r) => !r.replyComment);

  return {
    total: rows.length,
    unanswered: unanswered.length,
    drafted: unanswered.filter((r) => r.draftReply).length,
    sentByUs: rows.filter((r) => r.sentAt).length,
    answeredElsewhere: rows.filter((r) => r.replyComment && !r.sentAt).length,
    unansweredNegative: unanswered.filter(
      (r) => typeof r.starRating === "number" && r.starRating <= 3,
    ).length,
    averageRating:
      rated.length > 0
        ? Math.round(
            (rated.reduce((s, r) => s + (r.starRating ?? 0), 0) / rated.length) * 10,
          ) / 10
        : null,
  };
}

export type QueueFilter = "unanswered" | "drafted" | "answered" | "all";

/**
 * Reviews to work through.
 *
 * Ordered worst-rated first within the unanswered set, then newest. An
 * angry one-star review sitting unanswered for a month costs more than a
 * five-star one, and a queue sorted only by date buries it.
 */
export async function listReviewQueue(opts: {
  clientId: number;
  filter?: QueueFilter;
  limit?: number;
}): Promise<GbpReviewRow[]> {
  const filter = opts.filter ?? "unanswered";
  const conditions = [
    eq(gbpReviews.clientId, opts.clientId),
    isNull(gbpReviews.removedAt),
  ];
  if (filter === "unanswered") conditions.push(isNull(gbpReviews.replyComment));
  if (filter === "drafted") {
    conditions.push(isNull(gbpReviews.replyComment));
    conditions.push(isNotNull(gbpReviews.draftReply));
  }
  if (filter === "answered") conditions.push(isNotNull(gbpReviews.replyComment));

  const rows = await db
    .select()
    .from(gbpReviews)
    .where(and(...conditions))
    // Nulls last: an unrated review should not sort above a one-star.
    .orderBy(
      sql`case when ${gbpReviews.starRating} is null then 9 else ${gbpReviews.starRating} end asc`,
      desc(gbpReviews.createTime),
    )
    .limit(Math.min(Math.max(opts.limit ?? 25, 1), 200));

  return rows;
}

/** Store a reply we have written but not sent. */
export async function saveDraftReply(opts: {
  clientId: number;
  reviewId: string;
  text: string | null;
}): Promise<void> {
  const text = opts.text?.trim() || null;
  await db
    .update(gbpReviews)
    .set({ draftReply: text, draftedAt: text ? new Date() : null })
    .where(
      and(
        eq(gbpReviews.clientId, opts.clientId),
        eq(gbpReviews.reviewId, opts.reviewId),
      ),
    );
}

export type SendOutcome =
  | { ok: true; reviewId: string }
  | { ok: false; reviewId: string; error: string };

/**
 * Send one reply to Google and record that we did.
 *
 * Writes `sentAt` and `replyComment` only after Google accepts it.
 * Recording the send first and hoping would produce a tool that reports
 * replies it never delivered, which is the failure this codebase keeps
 * finding in other places.
 */
export async function sendReply(opts: {
  clientId: number;
  reviewId: string;
  text: string;
}): Promise<SendOutcome> {
  const body = opts.text.trim();
  if (!body) {
    return { ok: false, reviewId: opts.reviewId, error: "The reply is empty." };
  }

  const [row] = await db
    .select()
    .from(gbpReviews)
    .where(
      and(
        eq(gbpReviews.clientId, opts.clientId),
        eq(gbpReviews.reviewId, opts.reviewId),
      ),
    )
    .limit(1);
  if (!row) {
    return { ok: false, reviewId: opts.reviewId, error: "No such review." };
  }
  if (row.removedAt) {
    return {
      ok: false,
      reviewId: opts.reviewId,
      error: "This review is no longer on Google.",
    };
  }

  const res = await replyToGbpReview({
    reviewName: `${row.locationName}/reviews/${row.reviewId}`,
    comment: body,
    clientIdScope: opts.clientId,
  });
  if (!res.ok) {
    return {
      ok: false,
      reviewId: opts.reviewId,
      error: res.error ?? "Google rejected the reply.",
    };
  }

  const now = new Date();
  await db
    .update(gbpReviews)
    .set({
      replyComment: body,
      replyUpdateTime: now,
      sentAt: now,
      draftReply: null,
      draftedAt: null,
    })
    .where(eq(gbpReviews.id, row.id));

  return { ok: true, reviewId: opts.reviewId };
}

/**
 * Send every draft that is ready.
 *
 * Sequential on purpose. Google rate-limits this endpoint, and a
 * parallel burst that half-succeeds leaves a queue nobody can reason
 * about. It stops at the first failure that is not specific to one
 * review, because twenty consecutive auth failures are one problem
 * reported twenty times.
 */
export async function sendAllDrafts(opts: {
  clientId: number;
  limit?: number;
}): Promise<{ sent: number; failed: SendOutcome[] }> {
  const drafts = await listReviewQueue({
    clientId: opts.clientId,
    filter: "drafted",
    limit: opts.limit ?? 50,
  });

  let sent = 0;
  const failed: SendOutcome[] = [];
  for (const row of drafts) {
    if (!row.draftReply) continue;
    const res = await sendReply({
      clientId: opts.clientId,
      reviewId: row.reviewId,
      text: row.draftReply,
    });
    if (res.ok) {
      sent++;
      continue;
    }
    failed.push(res);
    // Two failures in a row that are not about this review means the
    // connection is the problem. Carrying on would burn the rest of the
    // queue against the same error.
    if (failed.length >= 2 && failed.every((f) => !f.ok && isSystemic(f.error))) {
      break;
    }
  }
  return { sent, failed };
}

/** Does this error mean the next one will fail the same way? */
function isSystemic(error: string): boolean {
  return /scope|auth|token|credential|permission|401|403|quota|rate/i.test(error);
}
