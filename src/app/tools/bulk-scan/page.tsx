"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  ListChecks,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { runBulkScan, type BulkRow, type BulkScanResult } from "./actions";

type SortKey = "url" | "score" | "performance" | "totalFindings";

export default function BulkScanPage() {
  const [urls, setUrls] = useState("");
  const [save, setSave] = useState(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkScanResult | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "score",
    dir: "asc",
  });

  function run() {
    if (!urls.trim()) return;
    setResult(null);
    startTransition(async () => {
      setResult(await runBulkScan({ urls, saveSnapshots: save }));
    });
  }

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "url" ? "asc" : "desc" },
    );
  }

  const sortedRows = useMemo(() => {
    if (!result) return [];
    const rows = [...result.rows];
    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      if (sort.key === "url") return a.url.localeCompare(b.url) * dir;
      const av = (a[sort.key] ?? -1) as number;
      const bv = (b[sort.key] ?? -1) as number;
      return (av - bv) * dir;
    });
    return rows;
  }, [result, sort]);

  const urlCount = urls
    .split(/[\n,]+/)
    .map((u) => u.trim())
    .filter(Boolean).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
            <ListChecks className="size-5 text-violet-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Bulk URL scanner</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste up to 25 URLs. We run the full health check on each in parallel
          (audit + Core Web Vitals + security + redirects + images), then
          surface a sortable table. Optionally save every result as a snapshot
          so you can compare later.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl space-y-4 p-5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="bulk-urls">URLs (one per line, comma-separated, max 25)</Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {urlCount}/25
            </span>
          </div>
          <textarea
            id="bulk-urls"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={6}
            placeholder={
              "https://example.com\nhttps://example.com/blog\nhttps://example.com/pricing"
            }
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[13px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
            className="size-4 cursor-pointer accent-violet-500"
          />
          <span>
            Save every result as a snapshot (compare before / after later)
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={run} disabled={pending || !urls.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Scanning {urlCount} URL{urlCount === 1 ? "" : "s"}…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Run bulk scan
              </>
            )}
          </Button>
          {pending && (
            <span className="text-xs text-muted-foreground">
              ~30-60s per URL · 4 in parallel · this can take a few minutes
            </span>
          )}
        </div>
      </section>

      {result && (
        <>
          <div className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat
                label="URLs scanned"
                value={result.rows.length}
                tone="violet"
              />
              <Stat
                label="Successful"
                value={result.rows.filter((r) => r.ok).length}
                tone="emerald"
              />
              <Stat
                label="Failed"
                value={result.rows.filter((r) => !r.ok).length}
                tone="rose"
              />
              <Stat
                label="Total time"
                value={`${(result.durationMs / 1000).toFixed(0)}s`}
                tone="cyan"
                icon={Clock}
              />
            </div>
          </div>

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">
                Results — sorted by{" "}
                <span className="text-violet-300">{sort.key}</span>{" "}
                {sort.dir === "asc" ? "↑" : "↓"}
              </h2>
              {save && (
                <Link
                  href="/snapshots"
                  className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline"
                >
                  Saved snapshots
                  <ExternalLink className="size-3" />
                </Link>
              )}
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
                    <SortableTh
                      label="URL"
                      sort={sort}
                      kind="url"
                      onClick={() => toggleSort("url")}
                      className="px-5 py-3 text-left"
                    />
                    <SortableTh
                      label="Health"
                      sort={sort}
                      kind="score"
                      onClick={() => toggleSort("score")}
                      className="px-3 py-3 text-right"
                    />
                    <SortableTh
                      label="Perf"
                      sort={sort}
                      kind="performance"
                      onClick={() => toggleSort("performance")}
                      className="px-3 py-3 text-right"
                    />
                    <SortableTh
                      label="Issues"
                      sort={sort}
                      kind="totalFindings"
                      onClick={() => toggleSort("totalFindings")}
                      className="px-3 py-3 text-right"
                    />
                    <th className="px-3 py-3 text-left font-medium">
                      Severity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {sortedRows.map((r, i) => (
                    <Row key={i} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SortableTh({
  label,
  sort,
  kind,
  onClick,
  className,
}: {
  label: string;
  sort: { key: SortKey; dir: "asc" | "desc" };
  kind: SortKey;
  onClick: () => void;
  className?: string;
}) {
  const active = sort.key === kind;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 font-medium ${
          active ? "text-violet-300" : "hover:text-foreground"
        }`}
      >
        {label}
        {active &&
          (sort.dir === "asc" ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          ))}
      </button>
    </th>
  );
}

function Row({ row }: { row: BulkRow }) {
  if (!row.ok) {
    return (
      <tr className="bg-rose-500/[0.02]">
        <td className="px-5 py-3">
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 truncate text-rose-300 hover:underline"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            {row.url}
          </a>
          {row.error && (
            <div className="text-[11px] text-rose-300/80">{row.error}</div>
          )}
        </td>
        <td colSpan={4} className="px-3 py-3 text-xs text-muted-foreground">
          Failed
        </td>
      </tr>
    );
  }
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-5 py-3">
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 truncate font-mono text-xs hover:underline"
        >
          {row.url.replace(/^https?:\/\//, "").slice(0, 70)}
          <ExternalLink className="size-3 text-muted-foreground" />
        </a>
      </td>
      <td className="px-3 py-3 text-right">
        <ScorePill score={row.score} />
      </td>
      <td className="px-3 py-3 text-right">
        <ScorePill score={row.performance} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {row.totalFindings}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1 text-[10px]">
          {row.critical > 0 && (
            <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30">
              {row.critical} crit
            </span>
          )}
          {row.high > 0 && (
            <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30">
              {row.high} high
            </span>
          )}
          {row.medium > 0 && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
              {row.medium} med
            </span>
          )}
          {row.low > 0 && (
            <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
              {row.low} low
            </span>
          )}
          {row.totalFindings === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <CheckCircle2 className="size-2.5" />
              clean
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null)
    return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    score >= 80
      ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
      : score >= 50
        ? "bg-amber-500/10 text-amber-300 ring-amber-500/30"
        : "bg-rose-500/10 text-rose-300 ring-rose-500/30";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ring-1 ring-inset ${tone}`}
    >
      {score}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone: "violet" | "emerald" | "rose" | "cyan";
  icon?: typeof Clock;
}) {
  const cls = {
    violet: "text-gradient-violet",
    emerald: "text-gradient-emerald",
    rose: "text-gradient-rose",
    cyan: "text-gradient-cyan",
  }[tone];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
    </div>
  );
}
