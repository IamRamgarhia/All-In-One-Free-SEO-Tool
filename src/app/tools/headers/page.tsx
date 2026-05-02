"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Save,
  Search,
  ServerCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  inspectHeaders,
  saveHeadersSnapshot,
  type HeadersResult,
} from "./actions";

export default function HeadersPage() {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [savePending, startSave] = useTransition();
  const [result, setResult] = useState<HeadersResult | null>(null);
  const [saved, setSaved] = useState(false);

  function run() {
    if (!url.trim()) return;
    setResult(null);
    setSaved(false);
    startTransition(async () => {
      setResult(await inspectHeaders(url));
    });
  }

  function save() {
    if (!result) return;
    startSave(async () => {
      const r = await saveHeadersSnapshot({ url, data: result });
      if (r.ok) setSaved(true);
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
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <ServerCog className="size-5 text-violet-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">HTTP headers + redirect chain</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Follow every redirect step-by-step + show full HTTP response headers
          at each hop. Critical for canonicalization + redirect debugging.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="hurl">URL</Label>
            <Input
              id="hurl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <Button onClick={run} disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Tracing…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Trace
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
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <strong>{result.totalHops}</strong>{" "}
              {result.totalHops === 1 ? "hop" : "hops"}, ended at{" "}
              <span className="font-mono text-xs">{result.finalUrl}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={save}
              disabled={savePending || saved}
            >
              {savePending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving…
                </>
              ) : saved ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-300" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Save snapshot
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3">
            {result.chain.map((hop, i) => (
              <article
                key={i}
                className="glass-apple relative overflow-hidden rounded-2xl"
              >
                <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums ring-1 ring-inset ${
                        hop.status >= 200 && hop.status < 300
                          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                          : hop.status >= 300 && hop.status < 400
                            ? "bg-amber-500/10 text-amber-300 ring-amber-500/30"
                            : "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                      }`}
                    >
                      {hop.status || "ERR"}
                    </span>
                    <span className="truncate font-mono text-xs">
                      {hop.url}
                    </span>
                  </div>
                  {hop.redirectedTo && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <ArrowRight className="size-3" />
                      <span className="font-mono">{hop.redirectedTo}</span>
                    </span>
                  )}
                </header>
                <div className="p-5">
                  <table className="w-full text-[12px]">
                    <tbody>
                      {Object.entries(hop.headers).map(([k, v]) => (
                        <tr
                          key={k}
                          className="border-b border-white/[0.04] last:border-0"
                        >
                          <td className="w-1/3 py-1.5 pr-3 font-mono text-muted-foreground">
                            {k}
                          </td>
                          <td className="py-1.5 break-all font-mono text-foreground/90">
                            {v}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
