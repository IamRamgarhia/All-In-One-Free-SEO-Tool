"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { HelpLink } from "@/components/shell/help-link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analyzeLinks, type LinkAnalysisResult } from "./actions";

export default function LinkCheckerPage() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<LinkAnalysisResult | null>(null);
  const [filter, setFilter] = useState<"all" | "internal" | "external" | "nofollow" | "follow">(
    "all",
  );
  const [pending, startTransition] = useTransition();

  function run() {
    if (!url.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await analyzeLinks(url);
      setResult(r);
    });
  }

  const visible =
    result?.ok
      ? result.links.filter((l) => {
          if (filter === "all") return true;
          if (filter === "internal") return l.scope === "internal";
          if (filter === "external") return l.scope === "external";
          if (filter === "nofollow") return l.nofollow;
          if (filter === "follow") return !l.nofollow;
          return true;
        })
      : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/*
        The back link and the help button share a row.

        These pages hand-roll their header instead of using PageHeader,
        which is where <HelpLink /> normally lives — so 18 of the 92
        tools had no way to reach their documentation at all. The help
        link resolves the current route to that tool's own anchor on the
        reference page.
      */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          All tools
        </Link>
        <HelpLink />
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-400/30">
            <LinkIcon className="size-5 text-cyan-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Link analyzer</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste any URL — we extract every <code>&lt;a&gt;</code> link, classify
          internal vs external, dofollow vs nofollow, and surface the most-used
          anchor texts. Critical for outbound link audits before publishing.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <Label htmlFor="lc-url" className="text-sm">
          Page URL
        </Label>
        <div className="mt-2 flex gap-2">
          <Input
            id="lc-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="https://example.com/blog/post"
            className="flex-1"
            disabled={pending}
          />
          <Button onClick={run} disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Scanning…
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
          <section className="grid gap-3 sm:grid-cols-4">
            <Stat label="Total links" value={result.totalLinks} tone="violet" />
            <Stat
              label="Internal"
              value={result.internalCount}
              tone="cyan"
              onClick={() => setFilter("internal")}
              active={filter === "internal"}
            />
            <Stat
              label="External"
              value={result.externalCount}
              tone="amber"
              onClick={() => setFilter("external")}
              active={filter === "external"}
            />
            <Stat
              label="Nofollow"
              value={result.nofollowCount}
              tone="rose"
              onClick={() => setFilter("nofollow")}
              active={filter === "nofollow"}
            />
          </section>

          {result.topAnchors.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
              <h2 className="text-base font-semibold">Top anchor texts</h2>
              <p className="text-[11px] text-muted-foreground">
                Heavy repetition of one anchor text is a keyword-stuffing
                smell — vary your anchors.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.topAnchors.map((a) => (
                  <span
                    key={a.anchor}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs ring-1 ring-inset ring-white/10"
                  >
                    {a.anchor.length > 40
                      ? a.anchor.slice(0, 40) + "…"
                      : a.anchor}
                    <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                      ×{a.count}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-1 rounded-full bg-white/5 p-0.5 ring-1 ring-inset ring-white/10">
                {(["all", "internal", "external", "follow", "nofollow"] as const).map(
                  (f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={
                        filter === f
                          ? "rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground"
                          : "rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                      }
                    >
                      {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ),
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Showing {visible.length} of {result.totalLinks}
              </span>
            </header>
            <ul className="divide-y divide-white/[0.04]">
              {visible.map((l, i) => (
                <li key={i} className="px-5 py-2.5 text-sm">
                  <div className="flex items-start gap-2">
                    <span
                      className={
                        l.scope === "internal"
                          ? "shrink-0 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300 ring-1 ring-inset ring-cyan-500/30"
                          : "shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-500/30"
                      }
                    >
                      {l.scope}
                    </span>
                    {l.nofollow ? (
                      <span className="shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300 ring-1 ring-inset ring-rose-500/30">
                        nofollow
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                        dofollow
                      </span>
                    )}
                    {l.flags.sponsored && (
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-500/30">
                        sponsored
                      </span>
                    )}
                    {l.flags.ugc && (
                      <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-inset ring-violet-500/30">
                        ugc
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{l.anchor}</div>
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:underline"
                      >
                        {l.href}
                        <ExternalLink className="size-3" />
                      </a>
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

function Stat({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: number;
  tone: "violet" | "cyan" | "amber" | "rose";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneCls: Record<typeof tone, string> = {
    violet: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    cyan: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    rose: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  };
  const Inner = (
    <div className="glass-apple relative overflow-hidden rounded-2xl p-4 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={`flex size-6 items-center justify-center rounded-md ring-1 ring-inset ${toneCls[tone]}`}
        >
          <ArrowRight className="size-3" />
        </span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        className={`block text-left transition-transform hover:scale-[1.01] ${
          active ? "ring-2 ring-violet-400/50 ring-offset-2 ring-offset-background rounded-2xl" : ""
        }`}
      >
        {Inner}
      </button>
    );
  return Inner;
}
