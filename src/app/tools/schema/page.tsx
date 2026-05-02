"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Code2,
  Copy,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateSchema, type SchemaType } from "./actions";

const TYPES: { id: SchemaType; label: string; description: string }[] = [
  {
    id: "Article",
    label: "Article",
    description: "Blog posts, news, editorial content",
  },
  {
    id: "LocalBusiness",
    label: "LocalBusiness",
    description: "Brick-and-mortar with NAP",
  },
  {
    id: "FAQPage",
    label: "FAQPage",
    description: "Pages built around questions",
  },
  {
    id: "Product",
    label: "Product",
    description: "E-commerce product pages",
  },
  {
    id: "Recipe",
    label: "Recipe",
    description: "Food / cooking pages",
  },
  {
    id: "Event",
    label: "Event",
    description: "Concerts, conferences, classes",
  },
  {
    id: "Organization",
    label: "Organization",
    description: "Company / brand identity",
  },
];

export default function SchemaGeneratorPage() {
  const [type, setType] = useState<SchemaType>("Article");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [jsonld, setJsonld] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function run() {
    setError(null);
    setJsonld(null);
    startTransition(async () => {
      const r = await generateSchema({ type, url, notes });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setJsonld(r.jsonld);
    });
  }

  function copy() {
    if (!jsonld) return;
    navigator.clipboard.writeText(jsonld).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
          <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-400/30">
            <Code2 className="size-5 text-cyan-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Schema markup generator</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick a type, paste your URL — AI fills the rest using site metadata
          we auto-extract. Output: valid JSON-LD ready to paste into your{" "}
          <code className="rounded bg-white/5 px-1 py-0.5 text-xs">&lt;head&gt;</code>.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl space-y-4 p-5">
        <div className="space-y-1.5">
          <Label>Schema type</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  type === t.id
                    ? "border-violet-500/40 bg-violet-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="surl">Page URL (we auto-extract metadata)</Label>
          <Input
            id="surl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yoursite.com/page"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="snotes">Extra notes (optional)</Label>
          <textarea
            id="snotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. published date 2024-08-15, author Jane Doe, price $29.99 USD"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={run} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate schema
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

      {jsonld && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CheckCircle2 className="size-4 text-emerald-300" />
              Generated JSON-LD
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              <Copy className="size-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </header>
          <div className="space-y-3 p-5">
            <pre className="overflow-x-auto rounded-md border border-white/10 bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-foreground/90">
              {jsonld}
            </pre>
            <div className="rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-muted-foreground">
              <strong className="text-violet-200">How to use:</strong> wrap
              this in{" "}
              <code className="rounded bg-white/5 px-1 py-0.5">
                &lt;script type=&quot;application/ld+json&quot;&gt;...&lt;/script&gt;
              </code>{" "}
              and paste into the page&apos;s{" "}
              <code className="rounded bg-white/5 px-1 py-0.5">&lt;head&gt;</code>.
              Validate at{" "}
              <a
                href="https://search.google.com/test/rich-results"
                target="_blank"
                rel="noreferrer"
                className="text-violet-300 underline-offset-2 hover:underline"
              >
                Google&apos;s Rich Results Test
              </a>
              .
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
