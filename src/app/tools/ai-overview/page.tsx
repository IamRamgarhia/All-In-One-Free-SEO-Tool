"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analyzeAiOverview, type AiOverviewAnalysis } from "./actions";

export default function AiOverviewPage() {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AiOverviewAnalysis | null>(null);

  function run() {
    if (!url.trim()) return;
    setResult(null);
    startTransition(async () => {
      setResult(await analyzeAiOverview(url));
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All tools
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-fuchsia-500/15 ring-1 ring-fuchsia-400/30">
            <Sparkles className="size-5 text-fuchsia-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">AI Overview optimizer</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste a page URL — the AI scores how citation-worthy it is for
          Google&apos;s AI Overviews + tells you exactly what to change.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="aurl">Page URL</Label>
            <Input
              id="aurl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/blog/post"
            />
          </div>
          <Button onClick={run} disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Analyze
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
          {/* Score + verdict */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <div className="grid gap-4 p-5 md:grid-cols-[auto_1fr]">
              <ScoreBubble score={result.citationScore} />
              <div className="space-y-1">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Verdict
                </div>
                <p className="text-sm text-foreground/95">{result.verdict}</p>
                {result.title && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Page: <span className="font-mono">{result.title}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Block
              title="Strengths"
              items={result.strengths}
              icon={TrendingUp}
              tone="emerald"
            />
            <Block
              title="Weaknesses"
              items={result.weaknesses}
              icon={TrendingDown}
              tone="rose"
            />
          </div>

          <Block
            title="Specific improvements to make"
            items={result.improvements}
            icon={Wand2}
            tone="violet"
          />
        </>
      )}
    </div>
  );
}

function Block({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: typeof Sparkles;
  tone: "emerald" | "rose" | "violet";
}) {
  if (items.length === 0) return null;
  const cls = {
    emerald: "text-emerald-300",
    rose: "text-rose-300",
    violet: "text-violet-300",
  }[tone];
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className={`size-4 ${cls}`} />
          {title}
        </h2>
      </header>
      <ul className="divide-y divide-white/[0.04]">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 px-5 py-3 text-sm">
            <CheckCircle2 className={`mt-0.5 size-3.5 shrink-0 ${cls}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScoreBubble({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : score >= 40
        ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
        : "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  return (
    <div
      className={`flex size-24 flex-col items-center justify-center rounded-2xl ring-1 ring-inset ${tone}`}
    >
      <div className="text-3xl font-bold tabular-nums">{score}</div>
      <div className="text-[10px] uppercase tracking-wider opacity-80">
        Citation
      </div>
    </div>
  );
}
