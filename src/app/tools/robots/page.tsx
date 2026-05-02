"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkRobots, type RobotsResult } from "./actions";

export default function RobotsPage() {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RobotsResult | null>(null);

  function run() {
    if (!url.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await checkRobots(url);
      setResult(r);
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
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
            <FileText className="size-5 text-emerald-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Robots.txt + sitemap validator</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Fetch + parse robots.txt and every sitemap it declares. Surface
          common indexability foot-guns.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="rurl">Site URL</Label>
            <Input
              id="rurl"
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
                Check
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
          {/* Issues */}
          {result.issues.length > 0 ? (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <AlertCircle className="size-4 text-amber-300" />
                  Issues found ({result.issues.length})
                </h2>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.issues.map((i, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 px-5 py-3 text-sm"
                  >
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle2 className="mr-2 inline size-4" />
              No issues. robots.txt + sitemaps look healthy.
            </div>
          )}

          {/* robots.txt content */}
          {result.robotsContent && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">robots.txt</h2>
                <a
                  href={result.robotsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {result.robotsUrl}
                  <ExternalLink className="size-3" />
                </a>
              </header>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-all p-5 font-mono text-[12px] leading-relaxed text-foreground/90">
                {result.robotsContent}
              </pre>
            </section>
          )}

          {/* Sitemaps */}
          {result.sitemaps.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">
                  Sitemaps ({result.sitemaps.length})
                </h2>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.sitemaps.map((s, i) => (
                  <li key={i} className="space-y-1 px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                      >
                        {s.url}
                        <ExternalLink className="size-3 text-muted-foreground" />
                      </a>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                          s.ok
                            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                            : "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                        }`}
                      >
                        {s.ok
                          ? `${s.type} · ${s.count.toLocaleString()} entries`
                          : "Failed"}
                      </span>
                    </div>
                    {s.fetchError && (
                      <div className="text-[11px] text-rose-300">
                        {s.fetchError}
                      </div>
                    )}
                    {s.childSitemaps && s.childSitemaps.length > 0 && (
                      <div className="mt-1 ml-2 border-l border-white/10 pl-3 text-[11px]">
                        <div className="text-muted-foreground">
                          {s.childSitemaps.length} child sitemaps:
                        </div>
                        <ul className="mt-0.5 space-y-0.5">
                          {s.childSitemaps.slice(0, 8).map((c, j) => (
                            <li
                              key={j}
                              className="truncate font-mono text-muted-foreground"
                            >
                              {c}
                            </li>
                          ))}
                          {s.childSitemaps.length > 8 && (
                            <li className="text-muted-foreground/70">
                              +{s.childSitemaps.length - 8} more
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
