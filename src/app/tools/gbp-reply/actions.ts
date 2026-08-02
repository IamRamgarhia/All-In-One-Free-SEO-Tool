"use server";

import {
  listGbpAccounts,
  listGbpLocations,
  listGbpReviews,
  replyToGbpReview,
  type GbpReview,
} from "@/lib/gbp-api";
import { callAI, lastAiFailure } from "@/lib/ai-call";
import type { AiFailure } from "@/lib/ai-error";

export type ReplyLocation = {
  /** "accounts/X/locations/Y" */
  name: string;
  title: string;
};

/**
 * Walk every GBP account the user manages and flatten the locations
 * into one picker-friendly list. Most agencies have one account with
 * a handful of locations; this still works for multi-account setups
 * (franchise owners, etc).
 */
export async function listReplyLocations(): Promise<
  | { ok: true; locations: ReplyLocation[]; aiFailure?: AiFailure | null }
  | { ok: false; error: string }
> {
  try {
    const accounts = await listGbpAccounts();
    const out: ReplyLocation[] = [];
    for (const a of accounts) {
      const locs = await listGbpLocations({ accountName: a.name });
      for (const l of locs) {
        out.push({ name: l.name, title: l.title || a.accountName });
      }
    }
    return { ok: true, locations: out, aiFailure: lastAiFailure() };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type ReviewWithDraft = GbpReview & {
  draft: string | null;
};

/**
 * Pull all reviews for a location + ask the AI to draft a reply for
 * each one that doesn't have a reply already. AI calls are sequential
 * — the workspace AI semaphore prevents bursting the provider — but
 * we cap at 20 reviews per run so a busy location doesn't blow the
 * token budget.
 */
export async function fetchReviewsWithDrafts(
  locationName: string,
  businessName: string,
): Promise<{ ok: true; reviews: ReviewWithDraft[]; aiFailure?: AiFailure | null } | { ok: false; error: string }> {
  try {
    const reviews = await listGbpReviews({ locationName, pageSize: 50 });
    const out: ReviewWithDraft[] = [];
    for (const r of reviews.slice(0, 20)) {
      if (r.reply) {
        out.push({ ...r, draft: null });
        continue;
      }
      const draft = await draftReplyForReview({
        businessName,
        reviewerName: r.reviewer.displayName,
        starRating: r.starRating,
        comment: r.comment,
      });
      out.push({ ...r, draft });
    }
    // Reviews beyond the cap come back with no draft so the user sees
    // they exist and can re-run for the next batch.
    for (const r of reviews.slice(20)) {
      out.push({ ...r, draft: null });
    }
    return { ok: true, reviews: out, aiFailure: lastAiFailure() };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function draftReplyForReview(opts: {
  businessName: string;
  reviewerName: string;
  starRating: number | null;
  comment: string | null;
}): Promise<string | null> {
  const isPositive = (opts.starRating ?? 0) >= 4;
  const isNegative = (opts.starRating ?? 0) > 0 && (opts.starRating ?? 0) <= 2;
  const tone = isPositive
    ? "grateful but not gushing"
    : isNegative
      ? "professional, empathetic, accountable — never defensive"
      : "warm, measured, inviting follow-up";

  const system = `You write Google Business Profile review replies for local businesses. Output ONE reply only — no preamble, no quotes, no markdown.

Rules:
- 40-90 words. Long replies look corporate.
- Address the reviewer by first name when available (NOT full name).
- Match the reviewer's tone — don't reply formally to a casual review.
- Tone for this review: ${tone}.
- For negative reviews: acknowledge the specific concern, take responsibility, propose a concrete next step (e.g. "please email us at ..." or "call us at ..."). Never argue. Never say "we'll do better."
- For positive reviews: thank them for the specific thing they mentioned. NEVER use the phrase "we appreciate your business."
- For neutral/3-star reviews: ask what would have made it a 5, invite back.
- Sign off naturally — "— The ${opts.businessName} team" or first-name closer if context warrants. Don't sign every reply the same way.
- Never use emoji (Google may downrank emoji-heavy replies and they read insincere).`;

  const user = `Business: ${opts.businessName}
Reviewer: ${opts.reviewerName}
Stars: ${opts.starRating ?? "(unknown)"} / 5
Review text: ${opts.comment ?? "(left no text — star rating only)"}`;

  return await callAI({
    system,
    user,
    maxTokens: 250,
    temperature: 0.55,
    timeoutMs: 45_000,
    feature: "review_reply",
  });
}

export type SubmitReplyState =
  | { ok: true; reviewId: string; aiFailure?: AiFailure | null }
  | { ok: false; error: string }
  | null;

/**
 * Post the (possibly edited) reply via the GBP API. Idempotent — the
 * v4 API treats reply PUT as upsert, so re-submitting silently
 * replaces a prior reply.
 */
export async function submitReply(
  _prev: SubmitReplyState,
  formData: FormData,
): Promise<SubmitReplyState> {
  const reviewName = String(formData.get("reviewName") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (!reviewName) return { ok: false, error: "Missing review name." };
  if (comment.length < 5)
    return { ok: false, error: "Reply too short." };
  const r = await replyToGbpReview({ reviewName, comment });
  if (!r.ok) return { ok: false, error: r.error ?? "Reply failed." };
  const reviewId = reviewName.split("/").pop() ?? "";
  return { ok: true, reviewId, aiFailure: lastAiFailure() };
}
