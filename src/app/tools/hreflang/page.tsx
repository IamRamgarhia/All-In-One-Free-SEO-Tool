"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkHreflang, type HreflangResult } from "./actions";

export default function HreflangPage() {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<HreflangResult | null>(null);

  function run() {
    if (!url.trim()) return;
    setResult(null);
    startTransition(async () => {
      setResult(await checkHreflang(url));
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
            <Globe className="size-5 text-cyan-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Hreflang validator</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Checks every hreflang tag (in HTML + HTTP Link header), validates
          format + self-reference + x-default, then verifies reciprocal links
          on each variant.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="hurl">Page URL</Label>
            <Input
              id="hurl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/en"
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
            result.entries.length > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                <CheckCircle2 className="mr-2 inline size-4" />
                Hreflang setup looks valid.
              </div>
            )
          )}

          {/* Entries */}
          {result.entries.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">
                  Detected entries ({result.entries.length})
                </h2>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">Lang</th>
                    <th className="px-5 py-3 text-left font-medium">Href</th>
                    <th className="px-3 py-3 text-left font-medium">Source</th>
                    <th className="px-3 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {result.entries.map((e, i) => (
                    <tr key={i} className="hover:bg-white/[0.03]">
                      <td className="px-5 py-2 font-mono">{e.lang}</td>
                      <td className="px-5 py-2 text-xs">
                        <a
                          href={e.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 truncate hover:underline"
                        >
                          {e.href.replace(/^https?:\/\//, "").slice(0, 60)}
                          <ExternalLink className="size-3 text-muted-foreground" />
                        </a>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground">
                        {e.source === "html_link" ? "HTML <link>" : "HTTP header"}
                      </td>
                      <td className="px-3 py-2">
                        {e.status === "ok" ? (
                          <CheckCircle2 className="size-3.5 text-emerald-300" />
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300 ring-1 ring-inset ring-rose-500/30">
                            {e.hint ?? "error"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Reciprocal */}
          {result.reciprocal.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">Reciprocal check</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Each variant should reference back to this URL. Up to 6 of
                  the most common variants checked.
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.reciprocal.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate font-mono text-xs hover:underline"
                    >
                      {r.url.replace(/^https?:\/\//, "")}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </a>
                    {!r.reachable ? (
                      <span className="text-xs text-muted-foreground">
                        Unreachable
                      </span>
                    ) : r.pointsBack ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                        <CheckCircle2 className="size-3" />
                        Points back ({r.langDeclared})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300 ring-1 ring-inset ring-rose-500/30">
                        <AlertCircle className="size-3" />
                        Doesn&apos;t point back
                      </span>
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
