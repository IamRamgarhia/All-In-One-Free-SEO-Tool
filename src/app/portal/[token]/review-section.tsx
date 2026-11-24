"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, CheckCircle2, ClipboardCheck, Loader2, MessageSquareText, X } from "lucide-react";
import { decideArticle, decideQueueItem } from "./review-actions";

const COMMENT_MAX = 1000;

/** One entry as the page hands it over: dates already in the reader's language. */
export type PortalReviewEntry = {
  kind: "queue" | "article";
  id: number;
  type: "blog_draft" | "gbp_post" | "social_post" | "article";
  title: string;
  text: string;
  href: string | null;
  sentOn: string;
  decision: "approved" | "changes" | null;
  comment: string | null;
  decidedOn: string | null;
};

/**
 * "À valider": what the agency prepared and sent for the client's
 * approval, with the two answers the client can give. Answered items
 * stay listed below, read-only.
 */
export function ReviewSection({
  token,
  waiting,
  answered,
}: {
  token: string;
  waiting: PortalReviewEntry[];
  answered: PortalReviewEntry[];
}) {
  const t = useTranslations("portal.review");
  if (waiting.length + answered.length === 0) return null;

  return (
    <section id="a-valider" className="scroll-mt-6 rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
      <header className="flex items-center gap-3 border-b border-white/5 px-4 py-4 sm:px-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-400/30">
          <ClipboardCheck className="size-4 text-sky-700 dark:text-sky-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">
            {waiting.length > 0 ? t("hint", { count: waiting.length }) : t("hintNone")}
          </p>
        </div>
      </header>

      {waiting.length > 0 && (
        <ul className="divide-y divide-white/5">
          {waiting.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="space-y-3 px-4 py-4 sm:px-5">
              <EntryHead entry={e} />
              <EntryBody entry={e} />
              <ReviewDecision token={token} kind={e.kind} id={e.id} />
            </li>
          ))}
        </ul>
      )}

      {answered.length > 0 && (
        <div className={waiting.length > 0 ? "border-t border-white/5" : ""}>
          <h3 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">
            {t("answered")}
          </h3>
          <ul className="divide-y divide-white/5">
            {answered.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="space-y-1.5 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words text-sm font-medium">
                    {e.href ? (
                      <a href={e.href} className="hover:underline">
                        {e.title || t(`type.${e.type}`)}
                      </a>
                    ) : (
                      e.title || t(`type.${e.type}`)
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{t(`type.${e.type}`)}</span>
                </div>
                <AnswerLine entry={e} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function EntryHead({ entry }: { entry: PortalReviewEntry }) {
  const t = useTranslations("portal.review");
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-white/5 px-2 py-0.5 font-medium text-foreground/80 ring-1 ring-inset ring-white/10">
          {t(`type.${entry.type}`)}
        </span>
        <span>{t("sentOn", { date: entry.sentOn })}</span>
      </div>
      {entry.title && <div className="break-words text-sm font-semibold">{entry.title}</div>}
    </div>
  );
}

function EntryBody({ entry }: { entry: PortalReviewEntry }) {
  const t = useTranslations("portal.review");
  const [full, setFull] = useState(false);
  const long = entry.text.length > 420;

  if (entry.kind === "article") {
    return (
      <div className="space-y-2">
        {entry.text && <p className="break-words text-sm text-muted-foreground">{entry.text}</p>}
        {entry.href && (
          <a
            href={entry.href}
            className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
          >
            {t("readArticle")}
            <ArrowRight className="size-3.5" />
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p
        className={`whitespace-pre-line break-words rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm leading-relaxed text-foreground/90 ring-1 ring-inset ring-white/5 ${
          long && !full ? "line-clamp-6" : ""
        }`}
      >
        {entry.text || t("emptyText")}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setFull((v) => !v)}
          className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          {full ? t("showLess") : t("showAll")}
        </button>
      )}
    </div>
  );
}

function AnswerLine({ entry }: { entry: PortalReviewEntry }) {
  const t = useTranslations("portal.review");
  if (entry.decision === "approved") {
    return (
      <p className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
        {t("approvedOn", { date: entry.decidedOn ?? "" })}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
        <MessageSquareText className="mt-0.5 size-3.5 shrink-0" />
        {t("changesOn", { date: entry.decidedOn ?? "" })}
      </p>
      {entry.comment && (
        <blockquote className="ml-5 whitespace-pre-line break-words border-l-2 border-amber-500/40 pl-3 text-xs text-muted-foreground">
          {entry.comment}
        </blockquote>
      )}
    </div>
  );
}

/**
 * The two answers: approve, or ask for changes with a comment. Also used
 * at the foot of an article's portal page.
 */
export function ReviewDecision({
  token,
  kind,
  id,
}: {
  token: string;
  kind: "queue" | "article";
  id: number;
}) {
  const t = useTranslations("portal.review");
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "changes" | null>(null);
  const [pending, start] = useTransition();

  const send = (decision: "approved" | "changes") => {
    setError(null);
    if (decision === "changes" && !comment.trim()) {
      setError(t("errors.comment"));
      return;
    }
    start(async () => {
      const act = kind === "queue" ? decideQueueItem : decideArticle;
      const r = await act(token, id, decision, decision === "changes" ? comment : undefined);
      if (r.ok) {
        setDone(decision);
        router.refresh();
      } else {
        setError(t(`errors.${r.error}`));
        if (r.error === "answered") router.refresh();
      }
    });
  };

  if (done) {
    return (
      <p
        role="status"
        className={`flex items-start gap-1.5 text-sm ${
          done === "approved" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
        }`}
      >
        <Check className="mt-0.5 size-4 shrink-0" />
        {done === "approved" ? t("thanksApproved") : t("thanksChanges")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {asking ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium">{t("commentLabel")}</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
              maxLength={COMMENT_MAX}
              rows={4}
              required
              autoFocus
              placeholder={t("commentPlaceholder")}
              className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-base focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 sm:text-sm"
            />
            <span className="block text-right text-[11px] text-muted-foreground">
              {t("commentCount", { count: comment.length, max: COMMENT_MAX })}
            </span>
          </label>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              disabled={pending}
              onClick={() => send("changes")}
              className="inline-flex h-10 w-full items-center whitespace-nowrap justify-center gap-1.5 rounded-lg bg-amber-500/15 px-4 text-sm font-medium text-amber-800 ring-1 ring-inset ring-amber-500/40 hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-200 sm:w-auto"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquareText className="size-4" />}
              {t("sendRequest")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setAsking(false);
                setError(null);
              }}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground sm:w-auto ring-1 ring-inset ring-white/10 hover:bg-white/5 disabled:opacity-50"
            >
              <X className="size-4" />
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            disabled={pending}
            onClick={() => send("approved")}
            className="inline-flex h-10 w-full items-center whitespace-nowrap justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-4 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-50 dark:text-emerald-200 sm:w-auto"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {t("approve")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setAsking(true)}
            className="inline-flex h-10 w-full items-center whitespace-nowrap justify-center gap-1.5 rounded-lg px-4 text-sm font-medium ring-1 ring-inset ring-white/15 hover:bg-white/5 disabled:opacity-50 sm:w-auto"
          >
            <MessageSquareText className="size-4" />
            {t("askChanges")}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
