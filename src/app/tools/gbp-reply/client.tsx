"use client";

import { useActionState, useState, useTransition } from "react";
import {
  CheckCircle2,
  Edit3,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import {
  fetchReviewsWithDrafts,
  submitReply,
  type ReplyLocation,
  type ReviewWithDraft,
  type SubmitReplyState,
} from "./actions";

export function ReplyClient({ locations }: { locations: ReplyLocation[] }) {
  const t = useTranslations("tools.ui.gbp-reply");
  const [locationName, setLocationName] = useState<string>(
    locations[0]?.name ?? "",
  );
  const [businessName, setBusinessName] = useState<string>(
    locations[0]?.title ?? "",
  );
  const [reviews, setReviews] = useState<ReviewWithDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  function loadReviews() {
    setError(null);
    setReviews(null);
    startLoading(async () => {
      const r = await fetchReviewsWithDrafts(locationName, businessName);
      if (r.ok) setReviews(r.reviews);
      else setError(r.error);
    });
  }

  if (locations.length === 0) {
    return (
      <div className="glass-apple rounded-2xl p-6 text-sm text-muted-foreground">
        {t.rich("noLocations", {
          link: (chunks) => (
            <a
              href="https://business.google.com"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 hover:underline"
            >
              {chunks}
            </a>
          ),
        })}
      </div>
    );
  }

  return (
    <>
      <section className="glass-apple flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <label className="min-w-[260px] flex-1 space-y-1 text-xs">
          <span className="text-muted-foreground">{t("location")}</span>
          <select
            value={locationName}
            onChange={(e) => {
              const v = e.target.value;
              setLocationName(v);
              setBusinessName(
                locations.find((l) => l.name === v)?.title ?? "",
              );
            }}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {locations.map((l) => (
              <option key={l.name} value={l.name}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={loading || !locationName}
          onClick={loadReviews}
          className="inline-flex h-9 items-center rounded-md bg-emerald-500/15 px-4 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              {t("loading")}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-3.5" />
              {t("load")}
            </>
          )}
        </button>
      </section>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {error}
        </p>
      )}

      {reviews && reviews.length === 0 && (
        <div className="glass-apple rounded-2xl p-6 text-sm text-muted-foreground">
          {t("noReviews")}
        </div>
      )}

      {reviews && reviews.length > 0 && (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <ReviewRow key={r.reviewId} review={r} locationName={locationName} />
          ))}
        </ul>
      )}
    </>
  );
}

function ReviewRow({
  review,
  locationName,
}: {
  review: ReviewWithDraft;
  locationName: string;
}) {
  const t = useTranslations("tools.ui.gbp-reply");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.draft ?? "");
  const [posted, setPosted] = useState(Boolean(review.reply));
  const [state, formAction, pending] = useActionState<
    SubmitReplyState,
    FormData
  >(submitReply, null);

  // When submit succeeds, latch posted state locally so the row turns
  // green without forcing a full page reload
  if (state?.ok && !posted) {
    setPosted(true);
    toast.success(t("posted"));
  }

  const reviewName = `${locationName}/reviews/${review.reviewId}`;

  return (
    <li className="glass-apple relative overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-start gap-3 border-b border-white/[0.06] p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {review.reviewer.displayName}
            </span>
            <StarRating value={review.starRating} />
            <span className="text-[10px] text-muted-foreground">
              {new Date(review.createTime).toLocaleDateString(locale)}
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">
            {review.comment ?? <i className="text-muted-foreground">{t("noText")}</i>}
          </p>
        </div>
        {posted && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
            <CheckCircle2 className="size-3" />
            {t("replied")}
          </span>
        )}
      </div>

      {review.reply ? (
        <div className="border-t border-white/[0.04] bg-emerald-500/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            {t("existingReply")}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/85">
            {review.reply.comment}
          </p>
        </div>
      ) : !review.draft ? (
        <div className="p-4 text-sm text-muted-foreground">
          {t("noDraft")}
        </div>
      ) : (
        <form action={formAction} className="space-y-3 p-4">
          <input type="hidden" name="reviewName" value={reviewName} />
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-emerald-300" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              {t("aiDraft")}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t("reviewBeforePosting")}
            </p>
          </div>
          {editing ? (
            <textarea
              name="comment"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              maxLength={1000}
              className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          ) : (
            <>
              <input type="hidden" name="comment" value={draft} />
              <p className="whitespace-pre-wrap rounded-md bg-white/[0.03] px-3 py-2 text-sm text-foreground/90 ring-1 ring-inset ring-white/5">
                {draft}
              </p>
            </>
          )}
          {state && !state.ok && (
            <p className="rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending || posted}
              className="inline-flex h-8 items-center rounded-md bg-emerald-500/15 px-3 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-1.5 size-3 animate-spin" />
                  {t("posting")}
                </>
              ) : (
                <>
                  <Send className="mr-1.5 size-3" />
                  {posted ? t("postedShort") : t("postReply")}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="inline-flex h-8 items-center rounded-md bg-white/5 px-3 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
            >
              {editing ? (
                <>
                  <X className="mr-1.5 size-3" />
                  {t("doneEditing")}
                </>
              ) : (
                <>
                  <Edit3 className="mr-1.5 size-3" />
                  {t("edit")}
                </>
              )}
            </button>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {draft.length}/1000
            </span>
          </div>
        </form>
      )}
    </li>
  );
}

function StarRating({ value }: { value: number | null }) {
  const t = useTranslations("tools.ui.gbp-reply");
  if (!value) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <MessageCircle className="size-3" />
        {t("noRating")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`size-3 ${
            i < value
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}
