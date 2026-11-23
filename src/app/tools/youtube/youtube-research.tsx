"use client";

import { useActionState } from "react";
import { ExternalLink, Eye, MessageSquare, ThumbsUp } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import {
  researchOnYouTube,
  type YouTubeResearchState,
} from "./actions";

export function YouTubeResearch() {
  const t = useTranslations("tools.ui.youtube");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<
    YouTubeResearchState | null,
    FormData
  >(researchOnYouTube, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("topic")}</span>
            <input
              name="query"
              required
              placeholder={t("topicPlaceholder")}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("sort")}</span>
            <select
              name="order"
              defaultValue="relevance"
              className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="relevance">{t("sortRelevance")}</option>
              <option value="viewCount">{t("sortViews")}</option>
              <option value="date">{t("sortDate")}</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center self-end rounded-md bg-rose-500/15 px-4 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
          >
            {pending ? t("searching") : t("submit")}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          {state.keywords.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
              <h2 className="text-base font-semibold">
                {t("phrases", { count: state.keywords.length })}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("phrasesHint")}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {state.keywords.map((k) => (
                  <span
                    key={k.phrase}
                    className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] ring-1 ring-inset ring-white/10"
                  >
                    {k.phrase}
                    <span className="text-muted-foreground">×{k.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">
                {t("topVideos", { count: state.videos.length })}
              </h2>
            </header>
            <ul className="divide-y divide-white/[0.05]">
              {state.videos.map((v) => (
                <li key={v.videoId} className="flex gap-3 px-5 py-3">
                  {v.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnail}
                      alt=""
                      className="size-20 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <a
                      href={`https://www.youtube.com/watch?v=${v.videoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate text-sm font-medium hover:underline"
                    >
                      {v.title}
                      <ExternalLink className="size-3 opacity-60" />
                    </a>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {v.channelTitle} ·{" "}
                      {new Date(v.publishedAt).toLocaleDateString(locale)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3" />
                        {fmt(v.viewCount)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ThumbsUp className="size-3" />
                        {fmt(v.likeCount)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3" />
                        {fmt(v.commentCount)}
                      </span>
                      <span>{fmtDuration(v.durationSec)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
