"use client";

import { ToolBackLink } from "@/components/tools/tool-back-link";
import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  suggestInternalLinks,
  type InternalLinkResult,
} from "./actions";
import { useClientId } from "@/components/client-id-field";
import { usePresetUrl } from "@/components/use-preset-url";

export default function InternalLinkingPage() {
  const t = useTranslations("tools.ui.internal-linking");
  // Opened from a client's file: the page to link to arrives filled in.
  const [targetUrl, setTargetUrl] = useState(usePresetUrl());
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState<InternalLinkResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Set when opened from a client's rail; null from /tools.
  const clientId = useClientId();

  function run() {
    if (!targetUrl.trim() || !keyword.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await suggestInternalLinks({
        targetUrl,
        targetKeyword: keyword,
        limit: 25,
        clientId,
      });
      setResult(r);
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ToolBackLink />

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Link2 className="size-5 text-violet-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">{t("title")}</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <div>
          <Label htmlFor="il-target" className="text-sm">
            {t("targetLabel")}
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
            {t("keywordLabel")}
          </Label>
          <Input
            id="il-keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t("keywordPlaceholder")}
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
              {t("running")}
            </>
          ) : (
            <>
              <Search className="size-4" />
              {t("submit")}
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
                {t.rich("scanned", {
                  count: result.pagesScanned,
                  strong: (chunks) => (
                    <strong className="text-foreground">{chunks}</strong>
                  ),
                })}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                {t.rich("found", {
                  count: result.suggestions.filter((s) => !s.alreadyLinks)
                    .length,
                  keyword: result.targetKeyword,
                  strong: (chunks) => (
                    <strong className="text-foreground">{chunks}</strong>
                  ),
                })}
              </span>
            </div>
          </section>

          {result.suggestions.length === 0 ? (
            <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">
                  {t("suggestionsTitle")}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {t("suggestionsHelp")}
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
                        {s.alreadyLinks ? t("alreadyLinks") : t("missingLink")}
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
              {t("howToTitle")}
            </h2>
            <ol className="mt-2 space-y-1.5 text-muted-foreground">
              {(["step1", "step2", "step3", "step4"] as const).map((key, i) => (
                <li key={key}>
                  <strong className="text-foreground">{i + 1}.</strong>{" "}
                  {t(`howTo.${key}`)}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
