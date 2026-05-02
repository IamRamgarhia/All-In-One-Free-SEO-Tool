"use client";

import { useState, useTransition } from "react";
import {
  Wand2,
  Loader2,
  Check,
  Copy,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getFixSuggestions,
  type FixResult,
} from "@/app/audits/fix-actions";

const issueLabels: Record<string, string> = {
  missing_title: "Add a <title>",
  short_title: "Lengthen the <title>",
  long_title: "Shorten the <title>",
  missing_meta_description: "Add a meta description",
  short_meta_description: "Lengthen the meta description",
  long_meta_description: "Shorten the meta description",
  missing_h1: "Add an <h1>",
  missing_canonical: "Add a canonical link",
  missing_viewport: "Add a viewport meta tag",
};

import { isFixable } from "@/lib/fix-suggestions";

export function FixWizard({
  issueType,
  pageUrl,
}: {
  issueType: string;
  pageUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<FixResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isFixable(issueType)) return null;

  const handleOpen = () => {
    setOpen(true);
    if (!result) {
      startTransition(async () => {
        const r = await getFixSuggestions(pageUrl, issueType);
        setResult(r);
      });
    }
  };

  return (
    <div className="mt-3">
      {!open ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpen}
          className="border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
        >
          <Wand2 className="size-3.5" />
          Fix it for me
        </Button>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/8 via-card/40 to-fuchsia-500/5 p-4 backdrop-blur-md">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-violet-500/15 blur-3xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wand2 className="size-4 text-violet-300" />
              <span className="text-gradient-violet">
                {issueLabels[issueType] ?? "Fix it"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="relative mt-3">
            {pending && !result ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Fetching the page and building suggestions…
              </div>
            ) : result && !result.ok ? (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">
                {result.error}
              </div>
            ) : result && result.ok ? (
              <FixWizardBody
                issueType={issueType}
                ctx={result.context}
                suggestions={result.suggestions}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function FixWizardBody({
  issueType,
  ctx,
  suggestions,
}: {
  issueType: string;
  ctx: import("@/app/audits/fix-actions").FixContext;
  suggestions: import("@/lib/fix-suggestions").Suggestion[];
}) {
  const titleFamily =
    issueType === "missing_title" ||
    issueType === "short_title" ||
    issueType === "long_title";
  const metaFamily =
    issueType === "missing_meta_description" ||
    issueType === "short_meta_description" ||
    issueType === "long_meta_description";

  const currentValue =
    titleFamily
      ? ctx.title
      : metaFamily
        ? ctx.description
        : issueType === "missing_h1"
          ? ctx.h1
          : issueType === "missing_canonical"
            ? ctx.canonical
            : issueType === "missing_viewport"
              ? ctx.viewport
              : null;

  return (
    <div className="space-y-4 text-sm">
      {/* Current state */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Currently
        </div>
        <div className="mt-1.5 rounded-lg border border-white/5 bg-black/20 p-3">
          {currentValue ? (
            <>
              <div className="font-mono text-xs text-foreground/90 break-words">
                {currentValue}
              </div>
              {(titleFamily || metaFamily) && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {currentValue.length} characters
                </div>
              )}
            </>
          ) : (
            <div className="text-xs italic text-muted-foreground">
              Nothing set on this page.
            </div>
          )}
        </div>
      </div>

      {/* Live SERP preview when title/meta */}
      {(titleFamily || metaFamily) && suggestions.length > 0 && (
        <SerpPreview
          title={titleFamily ? suggestions[0].value : ctx.title ?? "—"}
          description={
            metaFamily
              ? suggestions[0].value
              : ctx.description ?? "Your meta description will appear here."
          }
          url={ctx.pageUrl}
        />
      )}

      {/* Suggestions */}
      {suggestions.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-xs text-muted-foreground">
          We couldn&apos;t generate suggestions automatically. The page may not
          have enough context (no H1, no first paragraph). Write something
          custom for now.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Suggested fixes
          </div>
          {suggestions.map((s, i) => (
            <SuggestionRow key={i} suggestion={s} />
          ))}
        </div>
      )}

      {/* Open page link */}
      <a
        href={ctx.pageUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        <ExternalLink className="size-3" />
        Open page in new tab
      </a>
    </div>
  );
}

function SuggestionRow({
  suggestion,
}: {
  suggestion: import("@/lib/fix-suggestions").Suggestion;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(suggestion.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-lg border border-white/5 bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="font-mono text-xs text-foreground break-words">
            {suggestion.value}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{suggestion.rationale}</span>
            {suggestion.charCount !== undefined && (
              <span className="rounded bg-white/5 px-1.5 py-0.5 ring-1 ring-inset ring-white/10">
                {suggestion.charCount} chars
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={
            copied
              ? "inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
              : "inline-flex shrink-0 items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-foreground/80 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
          }
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function SerpPreview({
  title,
  description,
  url,
}: {
  title: string;
  description: string;
  url: string;
}) {
  let displayUrl = url;
  try {
    const u = new URL(url);
    displayUrl = `${u.hostname.replace(/^www\./, "")} › ${u.pathname.split("/").filter(Boolean).join(" › ") || ""}`;
  } catch {
    /* keep raw url */
  }
  return (
    <div className="rounded-lg border border-white/5 bg-white/95 p-3 text-black">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        Google preview
      </div>
      <div className="mt-1 text-[11px] text-zinc-600">{displayUrl}</div>
      <div className="mt-0.5 text-base font-medium text-blue-700 leading-tight line-clamp-1">
        {title || "—"}
      </div>
      <div className="mt-0.5 text-xs text-zinc-700 leading-snug line-clamp-2">
        {description || "—"}
      </div>
    </div>
  );
}
