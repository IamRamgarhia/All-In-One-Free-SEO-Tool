"use client";

/**
 * The review desk.
 *
 * One screen where a backlog gets cleared: what is unanswered, worst
 * first, with a draft you can edit and send.
 *
 * Two things it will not do, both deliberate.
 *
 * It does not draft and send in one action. The "Draft the next 10"
 * button writes drafts and stops; publishing is a second, separate
 * press, after you have read them. Ten replies going out in a business
 * owner's name because one button did both would be the worst failure
 * this tool has available.
 *
 * It does not call anything "replied by us" unless we sent it. A reply
 * typed into Google's own app shows as answered, and says who.
 */

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import type { GbpReviewRow } from "@/db/schema";
import type { QueueFilter } from "@/lib/gbp-review-queue";
import type { ReviewDeskState } from "./actions";
import {
  draftNextReplies,
  loadReviewDesk,
  publishAllDrafts,
  publishReply,
  saveDraft,
  syncReviews,
} from "./actions";

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: "unanswered", label: "Needs a reply" },
  { id: "drafted", label: "Drafted, not sent" },
  { id: "answered", label: "Answered" },
  { id: "all", label: "Everything" },
];

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) {
    return <span className="text-[10px] text-muted-foreground">no rating</span>;
  }
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`size-3 ${i < rating ? "fill-amber-300 text-amber-300" : "text-white/20"}`}
        />
      ))}
    </span>
  );
}

function when(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export function ReviewDesk({
  clientId,
  initial,
}: {
  clientId: number;
  initial: ReviewDeskState;
}) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  // Edits live here until saved, so typing is not fighting a server
  // round-trip on every keystroke.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const reload = (filter: QueueFilter = state.filter) =>
    startTransition(async () => setState(await loadReviewDesk(clientId, filter)));

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const c = state.counts;
  const draftedCount = c.drafted;

  return (
    <div className="space-y-5">
      {/* ---- What the numbers are ---- */}
      <section className="glass-apple rounded-2xl px-5 py-4">
        {state.neverSynced ? (
          <p className="text-sm text-muted-foreground">
            No reviews have been pulled yet, so every number below would be
            zero for the wrong reason. Press <strong>Pull reviews</strong> to
            fetch them from Google.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <Stat label="Need a reply" value={c.unanswered} tone={c.unanswered > 0 ? "warn" : "ok"} />
            <Stat
              label="Of those, 3 stars or less"
              value={c.unansweredNegative}
              tone={c.unansweredNegative > 0 ? "bad" : "ok"}
            />
            <Stat label="Drafted, not sent" value={draftedCount} />
            <Stat label="Replied by this tool" value={c.sentByUs} />
            {/* Named precisely. A reply the owner typed into Google is
                still a reply, and claiming it would make "we answered
                everything" impossible to check. */}
            <Stat label="Replied elsewhere" value={c.answeredElsewhere} />
            <Stat label="Average rating" value={c.averageRating ?? "—"} />
            <span className="text-[11px] text-muted-foreground">
              {c.total} reviews held · last pulled {when(state.lastSynced)}
            </span>
          </div>
        )}
      </section>

      {/* ---- Actions ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() =>
            run("sync", async () => {
              const res = await syncReviews(clientId);
              setMessage(
                res.ok
                  ? {
                      tone: "ok",
                      text:
                        `Pulled: ${res.added} new, ${res.updated} updated` +
                        (res.removed ? `, ${res.removed} gone` : "") +
                        (res.complete
                          ? ""
                          : ". Stopped at the page cap, so nothing was marked as gone."),
                    }
                  : { tone: "bad", text: res.error },
              );
              reload();
            })
          }
          busy={busy === "sync"}
          icon={RefreshCw}
        >
          Pull reviews
        </Button>

        <Button
          onClick={() =>
            run("draft", async () => {
              const res = await draftNextReplies({ clientId, limit: 10 });
              if (!res.ok) {
                setMessage({ tone: "bad", text: res.error });
                return;
              }
              const { drafted, failed, stoppedEarly } = res.result;
              setMessage({
                // A batch where some failed is not a success with a
                // footnote. Saying "10 drafted" when 3 failed is how a
                // negative review goes unanswered for months.
                tone: failed.length > 0 ? "bad" : "ok",
                text:
                  `Drafted ${drafted.length}.` +
                  (failed.length
                    ? ` ${failed.length} could not be written: ${failed[0].error}`
                    : "") +
                  (stoppedEarly ? ` ${stoppedEarly}` : "") +
                  " Nothing has been sent — read them first.",
              });
              reload("drafted");
            })
          }
          busy={busy === "draft"}
          icon={Sparkles}
          disabled={c.unanswered === 0}
        >
          Draft the next 10
        </Button>

        {draftedCount > 0 && (
          <Button
            onClick={() =>
              run("publish", async () => {
                const res = await publishAllDrafts(clientId);
                setMessage({
                  tone: res.failed.length > 0 ? "bad" : "ok",
                  text:
                    `Sent ${res.sent}.` +
                    (res.failed.length
                      ? ` ${res.failed.length} failed: ${res.failed[0].error}`
                      : ""),
                });
                reload();
              })
            }
            busy={busy === "publish"}
            icon={Send}
            tone="primary"
          >
            Send all {draftedCount} drafts
          </Button>
        )}
      </div>

      {message && (
        <p
          className={`rounded-md px-3 py-2 text-xs ${
            message.tone === "ok"
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-amber-500/10 text-amber-200"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* ---- Filters ---- */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => reload(f.id)}
            className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset transition-colors ${
              state.filter === f.id
                ? "bg-cyan-500/15 text-cyan-200 ring-cyan-500/30"
                : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {/* ---- The queue ---- */}
      {state.rows.length === 0 ? (
        <p className="rounded-xl bg-white/[0.02] px-5 py-8 text-center text-sm text-muted-foreground">
          {state.neverSynced
            ? "Nothing here yet."
            : state.filter === "unanswered"
              ? "Every review has a reply."
              : "Nothing matches this filter."}
        </p>
      ) : (
        <ul className="space-y-3">
          {state.rows.map((r) => (
            <ReviewCard
              key={r.reviewId}
              clientId={clientId}
              row={r}
              draft={edits[r.reviewId] ?? r.draftReply ?? ""}
              onDraftChange={(text) =>
                setEdits((e) => ({ ...e, [r.reviewId]: text }))
              }
              onSaved={() => reload()}
              onMessage={setMessage}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn" | "bad";
}) {
  const colour =
    tone === "bad"
      ? "text-rose-300"
      : tone === "warn"
        ? "text-amber-300"
        : "text-foreground";
  return (
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${colour}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Button({
  children,
  onClick,
  busy,
  icon: Icon,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  tone?: "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-40 ${
        tone === "primary"
          ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400/30 hover:bg-cyan-500/30"
          : "bg-white/5 text-foreground ring-white/10 hover:bg-white/10"
      }`}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Icon className="size-3.5" />
      )}
      {children}
    </button>
  );
}

function ReviewCard({
  clientId,
  row,
  draft,
  onDraftChange,
  onSaved,
  onMessage,
}: {
  clientId: number;
  row: GbpReviewRow;
  draft: string;
  onDraftChange: (text: string) => void;
  onSaved: () => void;
  onMessage: (m: { tone: "ok" | "bad"; text: string }) => void;
}) {
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const answered = Boolean(row.replyComment);
  const bySomeoneElse = answered && !row.sentAt;

  return (
    <li className="glass-apple rounded-xl px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{row.reviewerName ?? "Anonymous"}</span>
        <Stars rating={row.starRating} />
        <span className="text-[11px] text-muted-foreground">
          {when(row.createTime)}
        </span>
        {answered && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ring-inset ${
              bySomeoneElse
                ? "bg-white/5 text-muted-foreground ring-white/10"
                : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
            }`}
          >
            {/* The distinction, in the one place a user reads it. */}
            {bySomeoneElse ? "replied outside this tool" : "replied by this tool"}
          </span>
        )}
        {row.removedAt && (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-300 ring-1 ring-inset ring-rose-500/30">
            no longer on Google
          </span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
        {row.comment?.trim() || (
          <span className="italic">A rating with no written review.</span>
        )}
      </p>

      {answered ? (
        <div className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MessageSquare className="size-3" />
            The reply live on Google
          </div>
          <p className="whitespace-pre-wrap text-sm">{row.replyComment}</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={3}
            placeholder="Write the reply, or press 'Draft the next 10' above."
            className="w-full resize-y rounded-lg bg-black/20 px-3 py-2 text-sm ring-1 ring-inset ring-white/10 placeholder:text-muted-foreground focus:outline-none focus:ring-cyan-500/40"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={Check}
              busy={busy === "save"}
              disabled={!draft.trim()}
              onClick={async () => {
                setBusy("save");
                await saveDraft({ clientId, reviewId: row.reviewId, text: draft });
                setBusy(null);
                onSaved();
              }}
            >
              Save draft
            </Button>
            <Button
              icon={Send}
              tone="primary"
              busy={busy === "send"}
              disabled={!draft.trim()}
              onClick={async () => {
                setBusy("send");
                const res = await publishReply({
                  clientId,
                  reviewId: row.reviewId,
                  text: draft,
                });
                setBusy(null);
                onMessage(
                  res.ok
                    ? { tone: "ok", text: "Sent. It is on Google now." }
                    : { tone: "bad", text: res.error ?? "Google rejected it." },
                );
                onSaved();
              }}
            >
              Send to Google
            </Button>
            {row.starRating != null && row.starRating <= 3 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                <AlertTriangle className="size-3" />
                Answer this one first
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
