/**
 * Drafting replies to reviews, one or ten at a time.
 *
 * The single-reply path already existed and worked. What did not was
 * doing it at the scale a real backlog has: a business that has not
 * answered anyone in six months has forty reviews waiting, and an
 * interface that drafts one at a time is one nobody finishes.
 *
 * Two rules this module exists to hold.
 *
 * **Nothing is sent from here.** Drafting and sending are separate calls
 * and separate buttons. A batch that silently published forty replies in
 * a business owner's name would be the worst thing this tool could do,
 * and "it was only a draft" is not a defence once it is on Google.
 *
 * **A draft that could not be written says so.** A batch of ten where
 * three failed must report three failures, not seven successes. The
 * seven-successes version is how somebody finds out months later that a
 * negative review was never answered.
 */

import { callAI, lastAiFailure } from "./ai-call";
import { contextForPrompt, getClientContext } from "./client-knowledge";
import { listReviewQueue, saveDraftReply } from "./gbp-review-queue";
import type { GbpReviewRow } from "@/db/schema";

const SYSTEM = `You write replies to Google Business Profile reviews, as the business owner.

Rules:
- Personal but professional. Warm, not corporate.
- Acknowledge the specific thing the reviewer mentioned. A reply that could be pasted under any review is worse than no reply.
- Use the reviewer's first name if you have it.
- 80 words maximum. Shorter is better.
- 4-5 stars: thank them for the specific thing, invite them back.
- 1-3 stars: acknowledge the problem, no excuses, no arguing, offer to put it right by phone or email. Never dispute their account of what happened.
- A review with a rating and no text still gets a reply: short, and it must not pretend to know why they rated it that way.
- Do not promise refunds, discounts, compensation, or anything else the business has not authorised.
- Do not invent facts about the business, its staff, its prices or what happened. If you were not told it, do not say it.
- No marketing, no hashtags, no links.

Output ONLY the reply text. No preamble, no quotation marks.`;

export type DraftedReply = {
  reviewId: string;
  reviewer: string;
  starRating: number | null;
  reviewText: string | null;
  reply: string;
};

export type DraftFailure = {
  reviewId: string;
  reviewer: string;
  error: string;
};

export type DraftBatchResult = {
  drafted: DraftedReply[];
  failed: DraftFailure[];
  /** Reviews considered but skipped, with the reason. */
  skipped: { reviewId: string; reason: string }[];
  /** Set when the whole batch stopped early, and why. */
  stoppedEarly?: string;
};

function firstName(display: string | null): string {
  const name = (display ?? "").trim();
  if (!name || /^a google user$/i.test(name)) return "";
  return name.split(/\s+/)[0];
}

/**
 * Draft a reply for one review.
 *
 * `business` is the client-knowledge block. Without it a model replying
 * to "great service, quick turnaround" has to guess what the business
 * does, and the guess ends up in a reply published under the owner's
 * name.
 */
export async function draftOneReply(opts: {
  businessName: string;
  business: string | null;
  review: Pick<GbpReviewRow, "reviewerName" | "starRating" | "comment">;
}): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const name = firstName(opts.review.reviewerName);
  const text = opts.review.comment?.trim() ?? "";

  const user = [
    opts.business ? `About this business:\n${opts.business}\n` : "",
    `Business name: ${opts.businessName}`,
    name ? `Reviewer's first name: ${name}` : "The reviewer's name is not available — do not invent one.",
    `Rating: ${opts.review.starRating ?? "not given"}/5`,
    text
      ? `What they wrote: "${text}"`
      : "They left a rating and no written review. Keep the reply short and do not guess at their reasons.",
    "",
    "Write the reply now.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callAI({
    system: SYSTEM,
    user,
    maxTokens: 300,
    temperature: 0.5,
    timeoutMs: 30_000,
    feature: "review_reply",
  });

  if (!raw) {
    // The real reason, not a generic one. Telling somebody with an
    // exhausted quota to "set up an API key" sends them to a settings
    // page that is already correct.
    return {
      ok: false,
      error: lastAiFailure()?.message ?? "The AI provider did not respond.",
    };
  }

  const reply = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!reply) return { ok: false, error: "The model returned nothing usable." };
  if (reply.length > 1200) {
    // Google's own limit is 4096, but a 1200-character reply to an
    // 80-word rule means the model ignored the brief and is probably
    // explaining itself rather than replying.
    return {
      ok: false,
      error: `The draft is ${reply.length} characters, which means the model wrote an essay rather than a reply.`,
    };
  }
  return { ok: true, reply };
}

/**
 * Draft replies for the next N reviews that need one.
 *
 * Saves each draft as it goes rather than at the end, so a batch that
 * dies halfway leaves the work it already did. Sends nothing.
 */
export async function draftRepliesForQueue(opts: {
  clientId: number;
  businessName: string;
  /** How many to draft. The UI offers 10. */
  limit?: number;
  /** Re-draft reviews that already have an unsent draft. */
  redraft?: boolean;
}): Promise<DraftBatchResult> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 25);
  const business = contextForPrompt(
    await getClientContext(opts.clientId, { researchLimit: 0 }),
  );

  // Pull more than we need: some will already be drafted and get
  // skipped, and asking for exactly ten would then draft fewer.
  const queue = await listReviewQueue({
    clientId: opts.clientId,
    filter: "unanswered",
    limit: limit * 3,
  });

  const drafted: DraftedReply[] = [];
  const failed: DraftFailure[] = [];
  const skipped: { reviewId: string; reason: string }[] = [];
  let stoppedEarly: string | undefined;

  for (const row of queue) {
    if (drafted.length >= limit) break;

    if (row.draftReply && !opts.redraft) {
      skipped.push({ reviewId: row.reviewId, reason: "already drafted" });
      continue;
    }

    const res = await draftOneReply({
      businessName: opts.businessName,
      business,
      review: row,
    });

    if (!res.ok) {
      failed.push({
        reviewId: row.reviewId,
        reviewer: row.reviewerName ?? "Anonymous",
        error: res.error,
      });
      // Three failures in a row from the same cause is one problem, and
      // continuing spends the AI budget proving it ten more times.
      if (failed.length >= 3 && sameCause(failed)) {
        stoppedEarly = `Stopped after ${failed.length} failures with the same cause: ${res.error}`;
        break;
      }
      continue;
    }

    await saveDraftReply({
      clientId: opts.clientId,
      reviewId: row.reviewId,
      text: res.reply,
    });
    drafted.push({
      reviewId: row.reviewId,
      reviewer: row.reviewerName ?? "Anonymous",
      starRating: row.starRating,
      reviewText: row.comment,
      reply: res.reply,
    });
  }

  return { drafted, failed, skipped, stoppedEarly };
}

/** Are the last three failures the same problem reported three times? */
function sameCause(failures: DraftFailure[]): boolean {
  const last = failures.slice(-3);
  return last.length === 3 && new Set(last.map((f) => f.error)).size === 1;
}
