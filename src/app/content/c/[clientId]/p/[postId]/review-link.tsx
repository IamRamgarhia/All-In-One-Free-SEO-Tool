"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, CheckCircle2, Copy, EyeOff, Loader2, MessageSquareText, RotateCcw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setArticleReview } from "@/app/content/actions";

type Decision = "approved" | "changes" | null;

/**
 * Send the article to the client for approval before it goes live, and
 * show their answer. The client reads it in their portal
 * (portal/[token]/articles/[id]) and approves it or asks for changes;
 * sending it again after an edit asks for a new answer. An approval
 * publishes nothing: the agency still schedules the article.
 */
export function ReviewLink({
  clientId,
  postId,
  initialPath,
  hasDraft,
  sharedAt,
  decision,
  comment,
  decidedAt,
}: {
  clientId: number;
  postId: number;
  /** The review page's path when the article is already shared. */
  initialPath: string | null;
  hasDraft: boolean;
  /** ISO dates, formatted here in the reader's language. */
  sharedAt: string | null;
  decision: Decision;
  comment: string | null;
  decidedAt: string | null;
}) {
  const t = useTranslations("content.review");
  const tErr = useTranslations("content.errors");
  const locale = useLocale();
  const [path, setPath] = useState(initialPath);
  const [state, setState] = useState({ sharedAt, decision, comment, decidedAt });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });

  const toggle = (shared: boolean) => {
    setError(null);
    start(async () => {
      const r = await setArticleReview({ clientId, postId, shared });
      if (!r.ok) {
        setError(tErr(r.error));
        return;
      }
      setPath(r.path);
      setState((s) =>
        shared
          ? { sharedAt: new Date().toISOString(), decision: null, comment: null, decidedAt: null }
          : { ...s, sharedAt: null },
      );
    });
  };

  const status = (() => {
    if (state.decision === "approved" && state.decidedAt) return t("approvedOn", { date: when(state.decidedAt) });
    if (state.decision === "changes" && state.decidedAt) return t("changesOn", { date: when(state.decidedAt) });
    if (path && state.sharedAt) return t("sentOn", { date: when(state.sharedAt) });
    if (path) return t("on");
    return hasDraft ? t("off") : t("needsDraft");
  })();

  const tone =
    state.decision === "approved"
      ? "border-emerald-500/30 bg-emerald-500/[0.06]"
      : state.decision === "changes"
        ? "border-amber-500/30 bg-amber-500/[0.06]"
        : "border-border bg-card/40";

  return (
    <section className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${tone}`}>
      <span className="min-w-0 flex-1 basis-56">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {state.decision === "approved" ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : state.decision === "changes" ? (
            <MessageSquareText className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <UserCheck className="size-4 shrink-0 text-muted-foreground" />
          )}
          {t("title")}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{status}</span>
        {state.decision === "approved" && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{t("approvedHint")}</span>
        )}
      </span>
      {path ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.origin + path);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setError(window.location.origin + path);
              }
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t("copied") : t("copy")}
          </Button>
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("open")}
          </a>
          {state.decision && (
            <Button type="button" size="sm" variant="outline" disabled={pending || !hasDraft} onClick={() => toggle(true)}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              {t("sendAgain")}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => toggle(false)}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <EyeOff className="size-3.5" />}
            {t("stop")}
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={pending || !hasDraft} onClick={() => toggle(true)}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />}
          {t("share")}
        </Button>
      )}
      {state.decision === "changes" && state.comment && (
        <blockquote className="basis-full whitespace-pre-line break-words border-l-2 border-amber-500/50 pl-3 text-sm text-foreground/90">
          {state.comment}
        </blockquote>
      )}
      {error && <p className="basis-full break-all text-xs text-rose-500">{error}</p>}
    </section>
  );
}
