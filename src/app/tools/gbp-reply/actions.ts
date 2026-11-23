"use server";

import { requireSignedIn } from "@/lib/action-guard";

/**
 * @ai-partial
 *
 * Listing locations and fetching reviews work without a model. Drafting
 * the reply is the part that needs one.
 *
 * See tool-capabilities.derive.ts — this marker is what stops the badge
 * saying the whole page is unavailable when it is not.
 */

import {
  listGbpAccounts,
  listGbpLocations,
  listGbpReviews,
  replyToGbpReview,
  type GbpReview,
} from "@/lib/gbp-api";
import { getTranslations } from "next-intl/server";
import { callAI, lastAiFailure } from "@/lib/ai-call";
import { getReportLocale } from "@/lib/report-i18n";
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
  await requireSignedIn();
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
  await requireSignedIn();
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
  // Replies are published under the client's name: French workspaces get
  // a French reply, a French sign-off and a French placeholder for a
  // review that has stars and no text.
  const fr = (await getReportLocale()) === "fr";
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
- Sign off naturally — "${fr ? `— L'équipe ${opts.businessName}` : `— The ${opts.businessName} team`}" or first-name closer if context warrants. Don't sign every reply the same way.
- Never use emoji (Google may downrank emoji-heavy replies and they read insincere).${
    fr
      ? "\n- Reply in the language of the review. When the review has no text or its language is unclear, write in French, addressing the reader as « vous »."
      : ""
  }`;

  const user = `Business: ${opts.businessName}
Reviewer: ${opts.reviewerName}
Stars: ${opts.starRating ?? "(unknown)"} / 5
Review text: ${opts.comment ?? (fr ? "(aucun texte, seulement une note)" : "(left no text — star rating only)")}`;

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
  await requireSignedIn();
  const reviewName = String(formData.get("reviewName") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  const t = await getTranslations("tools.ui.gbp-reply");
  if (!reviewName) return { ok: false, error: t("errorMissingReview") };
  if (comment.length < 5)
    return { ok: false, error: t("errorTooShort") };
  const r = await replyToGbpReview({ reviewName, comment });
  if (!r.ok) return { ok: false, error: r.error ?? t("errorFailed") };
  const reviewId = reviewName.split("/").pop() ?? "";
  return { ok: true, reviewId, aiFailure: lastAiFailure() };
}
