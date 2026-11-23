"use client";

import { ToolBackLink } from "@/components/tools/tool-back-link";
import { useState, useTransition } from "react";
import {
  AlertCircle,
  ExternalLink,
  Flame,
  Loader2,
  MessageCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchReddit, type RedditResearchResult } from "./actions";

export default function RedditResearchPage() {
  const t = useTranslations("tools.ui.reddit-research");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [subreddit, setSubreddit] = useState("");
  const [sort, setSort] = useState<"relevance" | "top" | "new" | "comments">(
    "relevance",
  );
  const [time, setTime] = useState<"all" | "year" | "month" | "week">("year");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RedditResearchResult | null>(null);

  function run() {
    if (!query.trim()) return;
    setResult(null);
    startTransition(async () => {
      setResult(
        await searchReddit({
          query,
          subreddit: subreddit.replace(/^r\//, "") || undefined,
          sort,
          time,
        }),
      );
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ToolBackLink />

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-400/30">
            <Flame className="size-5 text-rose-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">{t("title")}</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("intro")}
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rq">{t("query")}</Label>
            <Input
              id="rq"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("queryPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rsub">{t("subreddit")}</Label>
            <Input
              id="rsub"
              value={subreddit}
              onChange={(e) => setSubreddit(e.target.value)}
              placeholder={t("subredditPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rsort">{t("sortBy")}</Label>
            <select
              id="rsort"
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as typeof sort)
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-[14px]"
            >
              <option value="relevance">{t("sortRelevance")}</option>
              <option value="top">{t("sortTop")}</option>
              <option value="comments">{t("sortComments")}</option>
              <option value="new">{t("sortNew")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rtime">{t("timeWindow")}</Label>
            <select
              id="rtime"
              value={time}
              onChange={(e) =>
                setTime(e.target.value as typeof time)
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-[14px]"
            >
              <option value="week">{t("timeWeek")}</option>
              <option value="month">{t("timeMonth")}</option>
              <option value="year">{t("timeYear")}</option>
              <option value="all">{t("timeAll")}</option>
            </select>
          </div>
        </div>
        <div className="pt-1">
          <Button onClick={run} disabled={pending || !query.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("searching")}
              </>
            ) : (
              <>
                <Search className="size-4" />
                {t("search")}
              </>
            )}
          </Button>
        </div>
      </section>

      {result && !result.ok && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="mr-2 inline size-4" />
          {result.error}
        </div>
      )}

      {result?.ok && (
        <>
          {/* Questions panel — gold for content briefs */}
          {result.questions.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles className="size-4 text-violet-300" />
                  {t("questionsTitle", { count: result.questions.length })}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("questionsHint")}
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.questions.map((q, i) => (
                  <li key={i} className="px-5 py-2.5 text-sm">
                    {q}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Top subreddits */}
          {result.topSubreddits.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
              <h2 className="text-base font-semibold">
                {t("topSubreddits")}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.topSubreddits.map((s) => (
                  <a
                    key={s.name}
                    href={`https://www.reddit.com/r/${s.name}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  >
                    r/{s.name}
                    <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                      {s.count}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Posts */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">
                {t("posts", { count: result.posts.length })}
              </h2>
            </header>
            <ul className="divide-y divide-white/[0.04]">
              {result.posts.map((p, i) => (
                <li key={i} className="px-5 py-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-0.5 pt-0.5 text-[10px] text-muted-foreground">
                      <span className="font-bold tabular-nums text-violet-300">
                        {p.score >= 1000
                          ? `${(p.score / 1000).toFixed(1)}k`
                          : p.score}
                      </span>
                      <span>{t("upvotes")}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {p.title}
                      </a>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <a
                          href={`https://www.reddit.com/r/${p.subreddit}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono hover:underline"
                        >
                          r/{p.subreddit}
                        </a>
                        <span>· u/{p.author}</span>
                        <span className="inline-flex items-center gap-0.5">
                          <MessageCircle className="size-3" />
                          {p.numComments}
                        </span>
                        <span>· {p.createdAt.toLocaleDateString(locale)}</span>
                        <a
                          href={p.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto inline-flex items-center gap-0.5 hover:text-foreground"
                        >
                          {t("open")}
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                      {p.selftext && (
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {p.selftext}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
