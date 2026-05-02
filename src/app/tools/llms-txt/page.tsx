"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generateLlmsTxt,
  validateLlmsTxt,
  type ValidateLlmsResult,
} from "./actions";

export default function LlmsTxtPage() {
  const [tab, setTab] = useState<"generate" | "validate">("generate");

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
          <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-400/30">
            <Sparkles className="size-5 text-rose-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">llms.txt manager</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          The emerging standard for telling AI crawlers (ChatGPT, Claude,
          Perplexity) what your site is about + which URLs matter.
        </p>
      </header>

      <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setTab("generate")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
            tab === "generate"
              ? "bg-violet-500/15 text-violet-300"
              : "text-muted-foreground"
          }`}
        >
          Generate
        </button>
        <button
          type="button"
          onClick={() => setTab("validate")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
            tab === "validate"
              ? "bg-violet-500/15 text-violet-300"
              : "text-muted-foreground"
          }`}
        >
          Validate existing
        </button>
      </div>

      {tab === "generate" ? <Generator /> : <Validator />}
    </div>
  );
}

function Generator() {
  const [url, setUrl] = useState("");
  const [hint, setHint] = useState("");
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function run() {
    setError(null);
    setContent(null);
    startTransition(async () => {
      const r = await generateLlmsTxt({ url, hint });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setContent(r.content);
    });
  }

  function copy() {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function download() {
    if (!content) return;
    const blob = new Blob([content], { type: "text/markdown" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = "llms.txt";
    a.click();
    URL.revokeObjectURL(u);
  }

  return (
    <div className="space-y-4">
      <section className="glass-apple relative overflow-hidden rounded-2xl space-y-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="lurl">Your site URL</Label>
          <Input
            id="lurl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yoursite.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lhint">Extra context (optional)</Label>
          <textarea
            id="lhint"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            rows={3}
            placeholder="e.g. main product is X, pricing page is at /pricing, blog is the most updated section"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate
              </>
            )}
          </Button>
          {error && (
            <span className="inline-flex items-center gap-1 text-xs text-rose-300">
              <AlertCircle className="size-3.5" />
              {error}
            </span>
          )}
        </div>
      </section>

      {content && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CheckCircle2 className="size-4 text-emerald-300" />
              Generated llms.txt
            </h2>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                <Copy className="size-3.5" />
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={download}
              >
                <Download className="size-3.5" />
                Download
              </Button>
            </div>
          </header>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {content}
          </pre>
          <div className="border-t border-white/[0.06] p-4 text-xs text-muted-foreground">
            <strong>Where to put it:</strong> upload as{" "}
            <code className="rounded bg-white/5 px-1 py-0.5">/llms.txt</code>{" "}
            at the root of your domain.
          </div>
        </section>
      )}
    </div>
  );
}

function Validator() {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ValidateLlmsResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const r = await validateLlmsTxt(url);
      setResult(r);
    });
  }

  return (
    <div className="space-y-4">
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="vurl">Site URL</Label>
            <Input
              id="vurl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="example.com"
            />
          </div>
          <Button onClick={run} disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Validate
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
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="Sections (##)" value={result.sectionCount} />
            <Tile label="Links" value={result.linkCount} />
            <Tile
              label="Size"
              value={`${result.content.length} chars`}
              tone={
                result.content.length <= 2000
                  ? "emerald"
                  : "amber"
              }
            />
          </div>

          {result.issues.length > 0 ? (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <AlertCircle className="size-4 text-amber-300" />
                  Issues ({result.issues.length})
                </h2>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.issues.map((i, idx) => (
                  <li key={idx} className="px-5 py-3 text-sm">
                    {i}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle2 className="mr-2 inline size-4" />
              llms.txt looks valid.
            </div>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">Content</h2>
            </header>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {result.content}
            </pre>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "violet",
}: {
  label: string;
  value: number | string;
  tone?: "violet" | "emerald" | "amber";
}) {
  const cls = {
    violet: "text-gradient-violet",
    emerald: "text-gradient-emerald",
    amber: "text-gradient-amber",
  }[tone];
  return (
    <div className="glass-apple relative overflow-hidden rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
    </div>
  );
}
