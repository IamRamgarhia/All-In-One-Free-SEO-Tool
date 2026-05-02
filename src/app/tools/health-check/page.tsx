"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  ClipboardList,
  Globe,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  Save,
  Search,
  ShieldCheck,
  Stethoscope,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  runHealthCheck,
  saveHealthSnapshot,
  type HealthFinding,
  type HealthResult,
} from "./actions";

const CATEGORY_ICON: Record<string, typeof Globe> = {
  "On-page": ClipboardList,
  Indexability: Globe,
  International: Globe,
  Security: Lock,
  Performance: Zap,
  Images: ImageIcon,
};

const SEV_TONE: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  high: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  low: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  info: "bg-white/5 text-muted-foreground ring-white/10",
};

export default function HealthCheckPage() {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [savePending, startSave] = useTransition();
  const [result, setResult] = useState<HealthResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  function run() {
    if (!url.trim()) return;
    setResult(null);
    setSaved(false);
    setFilter(null);
    startTransition(async () => {
      setResult(await runHealthCheck(url));
    });
  }

  function save() {
    if (!result || !result.ok) return;
    startSave(async () => {
      const r = await saveHealthSnapshot({ url, result });
      if (r.ok) setSaved(true);
    });
  }

  const filtered = useMemo(() => {
    if (!result || !result.ok) return [] as HealthFinding[];
    if (!filter) return result.findings;
    return result.findings.filter((f) => f.category === filter);
  }, [result, filter]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
            <Stethoscope className="size-5 text-violet-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">SEO health check</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          One URL → every checker we have, run in parallel: on-page audit,
          robots/sitemap, hreflang, security headers, Core Web Vitals,
          image audit, redirect chain. Save the result to compare before /
          after later.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="hcurl">Page URL</Label>
            <Input
              id="hcurl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <Button onClick={run} disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Running 7 checkers… (~60s)
              </>
            ) : (
              <>
                <Search className="size-4" />
                Run check
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
          {/* Summary header */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <div className="grid gap-4 p-5 md:grid-cols-[auto_1fr_auto]">
              <ScoreBubble score={result.summary.score} />
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Audited
                </div>
                <div className="truncate text-sm font-medium">
                  {result.brand.name ?? result.finalUrl}
                </div>
                <a
                  href={result.finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {result.finalUrl.replace(/^https?:\/\//, "")}
                </a>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(["critical", "high", "medium", "low"] as const).map(
                    (s) =>
                      result.summary.bySeverity[s] > 0 && (
                        <span
                          key={s}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${SEV_TONE[s]}`}
                        >
                          {result.summary.bySeverity[s]} {s}
                        </span>
                      ),
                  )}
                  {result.summary.totalFindings === 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                      <CheckCircle2 className="size-3" />
                      No issues
                    </span>
                  )}
                </div>
              </div>
              <Button
                type="button"
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
          </section>

          {/* Category filters */}
          {result.summary.totalFindings > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setFilter(null)}
                className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${
                  filter === null
                    ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                    : "bg-white/5 text-muted-foreground ring-white/10 hover:text-foreground"
                }`}
              >
                All ({result.summary.totalFindings})
              </button>
              {Object.entries(result.summary.byCategory).map(([cat, n]) => {
                const Icon = CATEGORY_ICON[cat] ?? Layers;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilter(cat)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 ring-inset ${
                      filter === cat
                        ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                        : "bg-white/5 text-muted-foreground ring-white/10 hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3" />
                    {cat} ({n})
                  </button>
                );
              })}
            </div>
          )}

          {/* Findings list */}
          {filtered.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">
                  Findings ({filtered.length})
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sorted by severity. Each line is something a real SEO would
                  fix.
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {filtered
                  .slice()
                  .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
                  .map((f, i) => (
                    <FindingRow key={i} finding={f} />
                  ))}
              </ul>
            </section>
          )}

          {/* Quick stat tiles for context */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Performance"
              value={
                result.raw.cwv?.ok && result.raw.cwv.performance !== null
                  ? `${result.raw.cwv.performance}/100`
                  : "—"
              }
              icon={Zap}
              tone={
                result.raw.cwv?.ok && result.raw.cwv.performance !== null
                  ? result.raw.cwv.performance >= 80
                    ? "emerald"
                    : result.raw.cwv.performance >= 50
                      ? "amber"
                      : "rose"
                  : "neutral"
              }
            />
            <Tile
              label="Security grade"
              value={result.raw.security?.ok ? result.raw.security.observatory?.grade ?? "—" : "—"}
              icon={ShieldCheck}
              tone="amber"
            />
            <Tile
              label="Sitemaps"
              value={
                result.raw.robots?.ok
                  ? String(result.raw.robots.sitemaps.length)
                  : "—"
              }
              icon={Globe}
              tone="cyan"
            />
            <Tile
              label="Images audited"
              value={
                result.raw.image?.ok ? String(result.raw.image.total) : "—"
              }
              icon={ImageIcon}
              tone="violet"
            />
          </div>

          <div className="rounded-md border border-violet-500/20 bg-violet-500/[0.04] px-3 py-2 text-xs text-muted-foreground">
            <Clipboard className="mr-1 inline size-3 text-violet-300" />
            Saved snapshots show up at{" "}
            <Link
              href="/snapshots"
              className="text-violet-300 hover:underline"
            >
              /snapshots
            </Link>{" "}
            where you can compare two scans of the same URL side-by-side
            (before / after speed work, redesigns, migrations).
          </div>
        </>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: HealthFinding }) {
  const Icon = CATEGORY_ICON[finding.category] ?? Layers;
  return (
    <li className="flex items-start gap-3 px-5 py-3 text-sm">
      <span
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${SEV_TONE[finding.severity]}`}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${SEV_TONE[finding.severity]}`}
          >
            {finding.severity}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {finding.category}
          </span>
          <span className="font-medium">
            {finding.type.replace(/_/g, " ")}
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground">{finding.message}</p>
      </div>
    </li>
  );
}

function ScoreBubble({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : score >= 50
        ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
        : "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  return (
    <div
      className={`flex size-24 flex-col items-center justify-center rounded-2xl ring-1 ring-inset ${tone}`}
    >
      <div className="text-3xl font-bold tabular-nums">{score}</div>
      <div className="text-[10px] uppercase tracking-wider opacity-80">
        Health
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Zap;
  tone: "violet" | "emerald" | "amber" | "cyan" | "rose" | "neutral";
}) {
  const cls = {
    violet: "text-gradient-violet",
    emerald: "text-gradient-emerald",
    amber: "text-gradient-amber",
    cyan: "text-gradient-cyan",
    rose: "text-gradient-rose",
    neutral: "text-foreground",
  }[tone];
  return (
    <div className="glass-apple relative overflow-hidden rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
    </div>
  );
}

function sevRank(s: string): number {
  return (
    { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[s] ?? 0
  );
}
