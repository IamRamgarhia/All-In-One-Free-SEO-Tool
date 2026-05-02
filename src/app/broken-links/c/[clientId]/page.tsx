"use client";

import { useState, useTransition, use } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Search,
  Unlink,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkUrl } from "@/app/broken-links/actions";
import type { BrokenLinksResult, LinkCheck } from "@/lib/broken-links";

export default function PerClientBrokenLinks({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = use(params);

  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BrokenLinksResult | null>(null);

  function run() {
    if (!url.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await checkUrl(url);
      setResult(r);
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/broken-links"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All clients
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-400/30">
            <Unlink className="size-5 text-rose-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Broken link finder</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Client #{clientId} · Paste any page URL — we&apos;ll fetch, extract every link, and check status codes in parallel (max ~200 links per scan).
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="blurl">Page URL to scan</Label>
            <Input
              id="blurl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com/blog/post"
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
                Scan
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
            <Tile label="Total links" value={result.totalLinks} tone="violet" />
            <Tile
              label="Broken"
              value={result.broken.length}
              tone={result.broken.length === 0 ? "emerald" : "rose"}
            />
            <Tile label="OK" value={result.ok_links.length} tone="emerald" />
          </div>

          {result.broken.length > 0 && (
            <Section title={`Broken (${result.broken.length})`} accent="rose">
              <LinkList rows={result.broken} />
            </Section>
          )}

          {result.broken.length === 0 && result.totalLinks > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle2 className="mr-2 inline size-4" />
              No broken links on this page. Run the scan on more URLs to cover the whole site.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: "rose" | "emerald";
  children: React.ReactNode;
}) {
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
      </header>
      {children}
      <span className={`hidden ${accent}`} />
    </section>
  );
}

function LinkList({ rows }: { rows: LinkCheck[] }) {
  return (
    <ul className="divide-y divide-white/[0.04]">
      {rows.map((r, i) => (
        <li key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
          <span
            className={`inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ring-1 ring-inset ${
              r.ok
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                : "bg-rose-500/10 text-rose-300 ring-rose-500/30"
            }`}
          >
            {r.ok ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <XCircle className="size-3" />
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] tabular-nums">
                {r.status || "ERR"}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                  r.scope === "internal"
                    ? "bg-violet-500/10 text-violet-300 ring-violet-500/30"
                    : "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30"
                }`}
              >
                {r.scope}
              </span>
              <a
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 truncate text-[13px] hover:underline"
              >
                {r.href}
                <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            </div>
            {r.anchor && (
              <div className="text-[11px] text-muted-foreground">
                Anchor: &ldquo;{r.anchor}&rdquo;
              </div>
            )}
            {r.error && (
              <div className="text-[11px] text-rose-300">{r.error}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "violet" | "emerald" | "rose";
}) {
  const cls = {
    violet: "text-gradient-violet",
    emerald: "text-gradient-emerald",
    rose: "text-gradient-rose",
  }[tone];
  return (
    <div className="glass-apple relative overflow-hidden rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
    </div>
  );
}
