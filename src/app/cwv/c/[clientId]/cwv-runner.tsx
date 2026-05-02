"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Smartphone,
  Monitor,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runCwvScan, deleteCwvReport } from "@/app/cwv/actions";

export type CwvRow = {
  id: number;
  url: string;
  strategy: "mobile" | "desktop";
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  ttfbMs: number | null;
  fcpMs: number | null;
  tbtMs: number | null;
  opportunities:
    | {
        id: string;
        title: string;
        savingsMs: number | null;
        description: string;
      }[]
    | null;
  overall: "pass" | "needs_improvement" | "fail" | null;
  error: string | null;
  scannedAt: Date;
};

export function CwvRunner({
  clientId,
  defaultUrl,
  reports,
}: {
  clientId: number;
  defaultUrl: string;
  reports: CwvRow[];
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  function run() {
    if (!url.trim()) {
      setMsg({ tone: "error", text: "Enter a URL." });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const r = await runCwvScan({ clientId, url, strategy });
      if (!r.ok) {
        setMsg({ tone: "error", text: r.error });
        return;
      }
      setMsg({
        tone: "success",
        text: `Performance ${r.performance}/100 · ${r.overall ?? "scanned"}`,
      });
      setTimeout(() => setMsg(null), 5000);
    });
  }

  return (
    <div className="space-y-6">
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Zap className="size-4 text-cyan-300" />
            New scan
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Calls PageSpeed Insights — free 25k requests/day. Takes ~30-60s per
            URL.
          </p>
        </header>
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="cwv-url">URL</Label>
              <Input
                id="cwv-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/important-page"
              />
            </div>
            <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setStrategy("mobile")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs ${
                  strategy === "mobile"
                    ? "bg-violet-500/15 text-violet-300"
                    : "text-muted-foreground hover:bg-white/5"
                }`}
              >
                <Smartphone className="size-3.5" />
                Mobile
              </button>
              <button
                type="button"
                onClick={() => setStrategy("desktop")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs ${
                  strategy === "desktop"
                    ? "bg-violet-500/15 text-violet-300"
                    : "text-muted-foreground hover:bg-white/5"
                }`}
              >
                <Monitor className="size-3.5" />
                Desktop
              </button>
            </div>
            <Button onClick={run} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <Zap className="size-4" />
                  Run scan
                </>
              )}
            </Button>
          </div>
          {msg && (
            <div
              className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
                msg.tone === "success"
                  ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
                  : "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30"
              }`}
            >
              {msg.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{msg.text}</span>
            </div>
          )}
        </div>
      </section>

      {reports.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          No scans yet. Try the homepage above and pick a strategy.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reports.map((r) => (
            <ReportCard key={r.id} r={r} clientId={clientId} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ r, clientId }: { r: CwvRow; clientId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <article className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {r.strategy === "mobile" ? (
              <Smartphone className="size-3.5 text-muted-foreground" />
            ) : (
              <Monitor className="size-3.5 text-muted-foreground" />
            )}
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm font-medium hover:underline"
            >
              {r.url.replace(/^https?:\/\//, "")}
            </a>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {r.scannedAt.toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          aria-label="Delete"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await deleteCwvReport(r.id, clientId);
            })
          }
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      </header>

      {r.error ? (
        <div className="p-5 text-sm text-rose-300">{r.error}</div>
      ) : (
        <div className="space-y-4 p-5">
          {/* 4 Lighthouse scores */}
          <div className="grid grid-cols-4 gap-2">
            <ScoreBubble label="Perf" score={r.performance} />
            <ScoreBubble label="A11y" score={r.accessibility} />
            <ScoreBubble label="Best" score={r.bestPractices} />
            <ScoreBubble label="SEO" score={r.seo} />
          </div>

          {/* Core Web Vitals — 3 metrics */}
          <div className="grid grid-cols-3 gap-2">
            <CwvMetric
              label="LCP"
              value={r.lcpMs}
              unit="ms"
              good={2500}
              ni={4000}
            />
            <CwvMetric
              label="INP"
              value={r.inpMs}
              unit="ms"
              good={200}
              ni={500}
            />
            <CwvMetric
              label="CLS"
              value={r.cls === null ? null : r.cls / 100}
              unit=""
              good={0.1}
              ni={0.25}
              decimals={2}
            />
          </div>

          {/* Other useful timings */}
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <SmallStat label="TTFB" value={r.ttfbMs} unit="ms" />
            <SmallStat label="FCP" value={r.fcpMs} unit="ms" />
            <SmallStat label="TBT" value={r.tbtMs} unit="ms" />
          </div>

          {/* Top opportunities */}
          {r.opportunities && r.opportunities.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Top opportunities
              </div>
              <ul className="space-y-1.5">
                {r.opportunities.slice(0, 5).map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-white/[0.02] px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate">{o.title}</span>
                    {o.savingsMs !== null && (
                      <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
                        Save {Math.round(o.savingsMs / 100) / 10}s
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ScoreBubble({
  label,
  score,
}: {
  label: string;
  score: number | null;
}) {
  const tone =
    score === null
      ? "bg-white/5 text-muted-foreground"
      : score >= 90
        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
        : score >= 50
          ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
          : "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg px-2 py-2 ring-1 ring-inset ${tone}`}
    >
      <div className="text-base font-bold tabular-nums">{score ?? "—"}</div>
      <div className="text-[9px] uppercase tracking-wider opacity-80">
        {label}
      </div>
    </div>
  );
}

function CwvMetric({
  label,
  value,
  unit,
  good,
  ni,
  decimals = 0,
}: {
  label: string;
  value: number | null;
  unit: string;
  good: number;
  ni: number;
  decimals?: number;
}) {
  const verdict =
    value === null
      ? "neutral"
      : value <= good
        ? "good"
        : value <= ni
          ? "ni"
          : "bad";
  const tone = {
    neutral: "bg-white/5 text-muted-foreground",
    good: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
    ni: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
    bad: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  }[verdict];
  return (
    <div className={`rounded-lg px-2 py-2 text-center ring-1 ring-inset ${tone}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-bold tabular-nums">
        {value === null ? "—" : value.toFixed(decimals)}
        {unit && <span className="text-[9px] opacity-70">{unit}</span>}
      </div>
    </div>
  );
}

function SmallStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <div className="rounded-md bg-white/[0.02] px-2 py-1.5 text-center">
      <div className="text-muted-foreground/80">{label}</div>
      <div className="font-semibold tabular-nums">
        {value === null ? "—" : value}
        {unit && <span className="ml-0.5 text-[9px] opacity-70">{unit}</span>}
      </div>
    </div>
  );
}
