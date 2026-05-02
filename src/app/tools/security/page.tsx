"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkSecurity, type SecurityResult } from "./actions";

export default function SecurityPage() {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SecurityResult | null>(null);

  function run() {
    if (!url.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await checkSecurity(url);
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
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-400/30">
            <ShieldCheck className="size-5 text-amber-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Security headers + SSL</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Mozilla Observatory + SSL Labs + critical HTTP headers in one shot.
          All free APIs. SSL Labs may take up to 60s if uncached.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="surl">Site URL</Label>
            <Input
              id="surl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="example.com"
            />
          </div>
          <Button onClick={run} disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Scanning…
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
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Observatory */}
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
              <div className="flex items-center gap-2 text-base font-semibold">
                <ShieldCheck className="size-4 text-amber-300" />
                Mozilla Observatory
              </div>
              {result.observatory ? (
                <div className="mt-3 flex items-center gap-4">
                  <GradeBadge grade={result.observatory.grade} />
                  <div className="text-sm">
                    <div className="font-semibold tabular-nums">
                      {result.observatory.score ?? "—"}/100
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {result.observatory.testsPassed} passed ·{" "}
                      {result.observatory.testsFailed} failed
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Couldn&apos;t reach Observatory. Try again in a moment.
                </p>
              )}
            </section>

            {/* SSL Labs */}
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Lock className="size-4 text-emerald-300" />
                SSL Labs
              </div>
              {result.ssl ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-4">
                    <GradeBadge grade={result.ssl.grade} />
                    <div className="text-xs text-muted-foreground">
                      {result.ssl.protocol ?? "—"}
                    </div>
                  </div>
                  {result.ssl.validTo && (
                    <div className="text-xs">
                      <div className="text-muted-foreground">Valid until</div>
                      <div className="font-mono tabular-nums">
                        {result.ssl.validTo}
                      </div>
                    </div>
                  )}
                  {result.ssl.issuer && (
                    <div className="text-xs">
                      <div className="text-muted-foreground">Issuer</div>
                      <div className="truncate font-mono text-[11px]">
                        {result.ssl.issuer}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  SSL Labs result not cached yet. Run again in 30-60s after
                  starting an analysis on{" "}
                  <a
                    href={`https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(result.hostname)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-300 underline-offset-2 hover:underline"
                  >
                    ssllabs.com
                  </a>
                  .
                </p>
              )}
            </section>
          </div>

          {/* HTTP headers */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">Security HTTP headers</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Direct check of the response headers. Even when one of the
                external APIs fails, this is reliable.
              </p>
            </header>
            <ul className="divide-y divide-white/[0.04]">
              {result.headers.map((h) => (
                <li
                  key={h.name}
                  className="flex items-start gap-3 px-5 py-3 text-sm"
                >
                  {h.good ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-mono text-[13px] font-medium">
                      {h.name}
                    </div>
                    <div className="break-all font-mono text-[11px] text-muted-foreground">
                      {h.value || "(missing)"}
                    </div>
                    {!h.good && h.hint && (
                      <div className="text-[11px] text-amber-300/80">
                        {h.hint}
                      </div>
                    )}
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

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade)
    return (
      <div className="flex size-12 items-center justify-center rounded-xl bg-white/5 text-base font-bold text-muted-foreground ring-1 ring-inset ring-white/10">
        —
      </div>
    );
  const tone =
    /^A/i.test(grade)
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : /^B/i.test(grade)
        ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
        : "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  return (
    <div
      className={`flex size-12 items-center justify-center rounded-xl text-lg font-bold ring-1 ring-inset ${tone}`}
    >
      {grade}
    </div>
  );
}
