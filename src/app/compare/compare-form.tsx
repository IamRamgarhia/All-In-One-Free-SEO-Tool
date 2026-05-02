"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Layers,
  Loader2,
  Minus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compareDomains, type CompareSnapshot } from "./actions";

export function CompareForm({
  initialA,
  initialB,
}: {
  initialA?: string;
  initialB?: string;
}) {
  const [a, setA] = useState(initialA ?? "");
  const [b, setB] = useState(initialB ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    a: CompareSnapshot;
    b: CompareSnapshot;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (!a.trim() || !b.trim()) {
      setError("Enter two URLs.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await compareDomains(a, b);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult({ a: r.a, b: r.b });
    });
  }

  return (
    <div className="space-y-6">
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Layers className="size-4 text-violet-300" />
            Head-to-head comparison
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Audit + tech stack + Core Web Vitals + brand metadata for two sites
            in parallel. Best for compare against a competitor before pitching.
          </p>
        </header>
        <div className="space-y-3 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="urlA">Site A (yours / your client&apos;s)</Label>
              <Input
                id="urlA"
                value={a}
                onChange={(e) => setA(e.target.value)}
                placeholder="acmecoffee.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="urlB">Site B (competitor)</Label>
              <Input
                id="urlB"
                value={b}
                onChange={(e) => setB(e.target.value)}
                placeholder="competitor.com"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={run} disabled={pending || !a.trim() || !b.trim()}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Comparing… (~60s)
                </>
              ) : (
                <>
                  <Layers className="size-4" />
                  Compare
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
        </div>
      </section>

      {result && <ResultGrid a={result.a} b={result.b} />}
    </div>
  );
}

function ResultGrid({
  a,
  b,
}: {
  a: CompareSnapshot;
  b: CompareSnapshot;
}) {
  return (
    <div className="space-y-6">
      {/* Identity row */}
      <div className="grid gap-4 md:grid-cols-2">
        <SiteHeader snapshot={a} side="A" />
        <SiteHeader snapshot={b} side="B" />
      </div>

      {/* Comparison rows */}
      <div className="glass-apple relative overflow-hidden rounded-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 text-left font-medium">Metric</th>
              <th className="px-5 py-3 text-left font-medium">A</th>
              <th className="px-5 py-3 text-left font-medium">B</th>
              <th className="px-5 py-3 text-left font-medium">Winner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            <Row
              label="Audit score (0-100)"
              icon={ShieldCheck}
              valA={a.audit?.score ?? null}
              valB={b.audit?.score ?? null}
              higherIsBetter={true}
              format={(v) => (v === null ? "—" : `${v}/100`)}
            />
            <Row
              label="Audit findings"
              icon={AlertCircle}
              valA={a.audit?.findings.length ?? null}
              valB={b.audit?.findings.length ?? null}
              higherIsBetter={false}
              format={(v) => (v === null ? "—" : String(v))}
            />
            <Row
              label="Performance (PSI mobile)"
              icon={Zap}
              valA={a.cwv?.performance ?? null}
              valB={b.cwv?.performance ?? null}
              higherIsBetter={true}
              format={(v) => (v === null ? "—" : `${v}/100`)}
            />
            <Row
              label="LCP"
              icon={TrendingUp}
              valA={a.cwv?.lcpMs ?? null}
              valB={b.cwv?.lcpMs ?? null}
              higherIsBetter={false}
              format={(v) => (v === null ? "—" : `${(v / 1000).toFixed(1)}s`)}
            />
            <Row
              label="CLS"
              icon={Minus}
              valA={a.cwv?.cls ?? null}
              valB={b.cwv?.cls ?? null}
              higherIsBetter={false}
              format={(v) => (v === null ? "—" : (v / 100).toFixed(2))}
            />
            <Row
              label="Tech count"
              icon={Layers}
              valA={a.techStack?.length ?? null}
              valB={b.techStack?.length ?? null}
              higherIsBetter={null}
              format={(v) => (v === null ? "—" : String(v))}
            />
            <SocialRow snapA={a} snapB={b} />
          </tbody>
        </table>
      </div>

      {/* Tech stacks */}
      <div className="grid gap-4 md:grid-cols-2">
        <TechBlock side="A" tech={a.techStack} />
        <TechBlock side="B" tech={b.techStack} />
      </div>

      {/* Audit findings side-by-side */}
      <div className="grid gap-4 md:grid-cols-2">
        <FindingsBlock side="A" snapshot={a} />
        <FindingsBlock side="B" snapshot={b} />
      </div>
    </div>
  );
}

function SiteHeader({
  snapshot,
  side,
}: {
  snapshot: CompareSnapshot;
  side: "A" | "B";
}) {
  const meta = snapshot.metadata;
  return (
    <div className="glass-apple relative overflow-hidden rounded-2xl p-5">
      <div className="flex items-start gap-3">
        {meta?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meta.logoUrl}
            alt=""
            className="size-12 shrink-0 rounded-lg border border-white/10 object-contain"
          />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-base font-bold text-violet-300 ring-1 ring-violet-400/30">
            {side}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{meta?.name ?? snapshot.url}</div>
          <a
            href={snapshot.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {snapshot.url.replace(/^https?:\/\//, "")}
            <Globe className="size-3" />
          </a>
          {meta?.description && (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
              {meta.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  icon: Icon,
  valA,
  valB,
  higherIsBetter,
  format,
}: {
  label: string;
  icon: typeof ShieldCheck;
  valA: number | null;
  valB: number | null;
  higherIsBetter: boolean | null;
  format: (v: number | null) => string;
}) {
  let winner: "A" | "B" | "tie" | null = null;
  if (valA !== null && valB !== null && higherIsBetter !== null) {
    if (valA === valB) winner = "tie";
    else if (higherIsBetter) winner = valA > valB ? "A" : "B";
    else winner = valA < valB ? "A" : "B";
  }
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2 font-medium">
          <Icon className="size-3.5 text-muted-foreground" />
          {label}
        </div>
      </td>
      <td className="px-5 py-3 tabular-nums">{format(valA)}</td>
      <td className="px-5 py-3 tabular-nums">{format(valB)}</td>
      <td className="px-5 py-3">
        {winner === "A" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
            <CheckCircle2 className="size-3" />
            A wins
          </span>
        )}
        {winner === "B" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
            <CheckCircle2 className="size-3" />
            B wins
          </span>
        )}
        {winner === "tie" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10">
            Tie
          </span>
        )}
        {winner === null && (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function SocialRow({
  snapA,
  snapB,
}: {
  snapA: CompareSnapshot;
  snapB: CompareSnapshot;
}) {
  const a = snapA.metadata?.socialLinks ?? {};
  const b = snapB.metadata?.socialLinks ?? {};
  const aCount = Object.keys(a).length;
  const bCount = Object.keys(b).length;
  return (
    <Row
      label="Social presence"
      icon={Sparkles}
      valA={aCount}
      valB={bCount}
      higherIsBetter={true}
      format={(v) =>
        v === null ? "—" : `${v} platform${v === 1 ? "" : "s"}`
      }
    />
  );
}

function TechBlock({
  side,
  tech,
}: {
  side: "A" | "B";
  tech: string[] | null;
}) {
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-3.5 text-violet-300" />
          Site {side} tech stack
        </h3>
      </header>
      <div className="p-5">
        {tech && tech.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tech.map((t) => (
              <span
                key={t}
                className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] ring-1 ring-inset ring-white/10"
              >
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not detected.</p>
        )}
      </div>
    </section>
  );
}

function FindingsBlock({
  side,
  snapshot,
}: {
  side: "A" | "B";
  snapshot: CompareSnapshot;
}) {
  const findings = snapshot.audit?.findings ?? [];
  const top = [...findings]
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
    .slice(0, 6);
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <AlertCircle className="size-3.5 text-rose-300" />
          Site {side} top issues
        </h3>
      </header>
      <ul className="divide-y divide-white/[0.04]">
        {top.length === 0 ? (
          <li className="px-5 py-3 text-sm text-muted-foreground">
            {snapshot.audit?.error ?? "No findings."}
          </li>
        ) : (
          top.map((f, i) => (
            <li key={i} className="px-5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                    f.severity === "critical" || f.severity === "high"
                      ? "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                      : f.severity === "medium"
                        ? "bg-amber-500/10 text-amber-300 ring-amber-500/30"
                        : "bg-white/5 text-muted-foreground ring-white/10"
                  }`}
                >
                  {f.severity}
                </span>
                <span className="font-medium">
                  {f.type.replace(/_/g, " ")}
                </span>
              </div>
              <div className="mt-0.5 text-muted-foreground">{f.message}</div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function sevRank(s: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s] ?? 0;
}
