"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  ScanText,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { checkPlagiarism, type PlagiarismResult } from "./actions";

export default function PlagiarismPage() {
  const [content, setContent] = useState("");
  const [result, setResult] = useState<PlagiarismResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!content.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await checkPlagiarism({ content });
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
          <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-400/30">
            <ScanText className="size-5 text-rose-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">
              Plagiarism + AI detector
            </span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          AI-powered review of how AI-generated and how original your content
          reads. For a definitive verbatim-plagiarism check against the live
          web, use the linked external tools — they have full web indexes we
          don&apos;t.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <Label htmlFor="pl-content" className="text-sm">
          Paste your draft
        </Label>
        <textarea
          id="pl-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste the article, blog post, or product description you're about to publish…"
          rows={12}
          disabled={pending}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            {content.length} chars · {content.split(/\s+/).filter(Boolean).length}{" "}
            words
          </span>
          <Button onClick={run} disabled={pending || content.length < 100}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <ScanText className="size-4" />
                Run check
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
          <section className="grid gap-3 sm:grid-cols-2">
            <Score
              label="AI likelihood"
              value={result.aiLikelihood}
              hint={
                result.aiLikelihood >= 70
                  ? "Reads heavily AI-generated"
                  : result.aiLikelihood >= 40
                    ? "Some AI signals — could be tightened"
                    : "Reads human-written"
              }
              tone={
                result.aiLikelihood >= 70
                  ? "rose"
                  : result.aiLikelihood >= 40
                    ? "amber"
                    : "emerald"
              }
            />
            <Score
              label="Originality score"
              value={result.originalityScore}
              hint={
                result.originalityScore >= 70
                  ? "Specific, opinionated, real-world"
                  : result.originalityScore >= 40
                    ? "Solid, but could use specifics"
                    : "Generic — needs named examples & numbers"
              }
              tone={
                result.originalityScore >= 70
                  ? "emerald"
                  : result.originalityScore >= 40
                    ? "amber"
                    : "rose"
              }
            />
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-4 text-violet-300" />
              Verdict
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{result.verdict}</p>
          </section>

          {result.flags.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">
                  Phrases flagged ({result.flags.length})
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Common AI templates spotted in your draft. Rewrite these in
                  your own voice.
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.flags.map((f, i) => (
                  <li key={i} className="px-5 py-3 text-sm">
                    <div className="rounded-md bg-rose-500/10 px-3 py-1.5 text-rose-200/90 ring-1 ring-inset ring-rose-500/20">
                      &ldquo;{f.snippet}&rdquo;
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">
                Verify against the web (external)
              </h2>
              <p className="text-[11px] text-muted-foreground">
                AI-detection alone misses verbatim plagiarism. Run these for a
                full check:
              </p>
            </header>
            <ul className="divide-y divide-white/[0.04]">
              {result.externalChecks.map((c) => (
                <li key={c.name} className="px-5 py-3 text-sm">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-start justify-between gap-3 transition-colors hover:bg-white/[0.02]"
                  >
                    <div>
                      <div className="font-medium group-hover:underline">
                        {c.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.note}
                      </div>
                    </div>
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Score({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "emerald" | "amber" | "rose";
}) {
  const toneCls: Record<typeof tone, string> = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  };
  return (
    <div className="glass-apple relative overflow-hidden rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-4xl font-bold tabular-nums ${toneCls[tone]}`}>
        {value}
        <span className="text-base text-muted-foreground"> /100</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
