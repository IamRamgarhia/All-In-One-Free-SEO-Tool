"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  suggestInternalLinks,
  type InternalLinkResult,
} from "./actions";

export default function InternalLinkingPage() {
  const [targetUrl, setTargetUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState<InternalLinkResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!targetUrl.trim() || !keyword.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await suggestInternalLinks({
        targetUrl,
        targetKeyword: keyword,
        limit: 25,
      });
      setResult(r);
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All tools
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Link2 className="size-5 text-violet-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Internal linking suggester</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick a target page + the keyword you&apos;re trying to rank it for.
          We crawl the site (sitemap + on-page links), find pages that mention
          the keyword in body text, and flag missing internal links you should
          add.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <div>
          <Label htmlFor="il-target" className="text-sm">
            Target page URL (the page you want to rank)
          </Label>
          <Input
            id="il-target"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com/blog/post"
            className="mt-1.5"
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="il-keyword" className="text-sm">
            Target keyword
          </Label>
          <Input
            id="il-keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="best espresso machine"
            className="mt-1.5"
            disabled={pending}
          />
        </div>
        <Button
          onClick={run}
          disabled={pending || !targetUrl.trim() || !keyword.trim()}
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Crawling…
            </>
          ) : (
            <>
              <Search className="size-4" />
              Find link opportunities
            </>
          )}
        </Button>
      </section>

      {result && !result.ok && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="mr-2 inline size-4" />
          {result.error}
        </div>
      )}

      {result?.ok && (
        <>
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span>
                Scanned{" "}
                <strong className="text-foreground">
                  {result.pagesScanned}
                </strong>{" "}
                internal pages
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                Found{" "}
                <strong className="text-foreground">
                  {result.suggestions.filter((s) => !s.alreadyLinks).length}
                </strong>{" "}
                pages that mention &ldquo;{result.targetKeyword}&rdquo; without
                linking to your target
              </span>
            </div>
          </section>

          {result.suggestions.length === 0 ? (
            <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
              No pages found that mention this keyword. Either the keyword is
              very rare on your site or the sitemap is missing — try a related
              term.
            </div>
          ) : (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">
                  Suggested link insertions
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Pages that mention the keyword. Pages without an existing
                  link to your target are listed first — those are your wins.
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.suggestions.map((s) => (
                  <li key={s.fromUrl} className="px-5 py-3.5 text-sm">
                    <div className="flex items-start gap-3">
                      <span
                        className={
                          s.alreadyLinks
                            ? "shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground ring-1 ring-inset ring-white/10"
                            : "shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
                        }
                      >
                        {s.alreadyLinks ? "Already links" : "Missing link"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <a
                          href={s.fromUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium hover:underline"
                        >
                          {s.fromTitle}
                          <ExternalLink className="size-3 text-muted-foreground" />
                        </a>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {s.fromUrl}
                        </div>
                        <p className="mt-2 rounded-md bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-inset ring-white/[0.04]">
                          {s.context.split(
                            new RegExp(
                              `\\b(${s.matchedPhrase})\\b`,
                              "i",
                            ),
                          ).map((part, i) =>
                            i % 2 === 1 ? (
                              <mark
                                key={i}
                                className="bg-violet-500/30 text-violet-100"
                              >
                                {part}
                              </mark>
                            ) : (
                              part
                            ),
                          )}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5 text-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CheckCircle2 className="size-4 text-emerald-300" />
              How to use this
            </h2>
            <ol className="mt-2 space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">1.</strong> Pick a page
                from &ldquo;Missing link&rdquo; — those are highest impact.
              </li>
              <li>
                <strong className="text-foreground">2.</strong> Open the page,
                find the highlighted phrase, link it to your target URL.
              </li>
              <li>
                <strong className="text-foreground">3.</strong> Use descriptive
                anchor text — the matched phrase usually works.
              </li>
              <li>
                <strong className="text-foreground">4.</strong> Re-submit the
                edited page in GSC URL Inspection so Google re-crawls fast.
              </li>
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
