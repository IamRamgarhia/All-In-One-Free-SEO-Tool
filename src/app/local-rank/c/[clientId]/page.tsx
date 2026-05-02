"use client";

import { useState, useTransition, use } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Map,
  MapPin,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runLocalRanks } from "@/app/local-rank/actions";
import type { LocalRankResult } from "@/lib/local-rank";

export default function PerClientLocalRank({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = use(params);
  const clientId = Number(cidStr);

  const [query, setQuery] = useState("");
  const [citiesText, setCitiesText] = useState("");
  const [country, setCountry] = useState("US");
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<LocalRankResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setRows(null);
    const cities = citiesText
      .split(/[\n,]/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (cities.length === 0) {
      setError("Add at least one city");
      return;
    }
    startTransition(async () => {
      const r = await runLocalRanks({ clientId, query, cities, country });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setRows(r.rows);
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/local-rank"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All clients
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
            <MapPin className="size-5 text-emerald-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Local rank tracker</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Check the same keyword across multiple cities to find geographic
          weak spots. Browser-mode (Playwright). ~10s per city.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lq">Keyword</Label>
            <Input
              id="lq"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="best plumber"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lcountry">Country</Label>
            <Input
              id="lcountry"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="US"
              maxLength={2}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lcities">Cities (comma or newline separated, max 8)</Label>
          <textarea
            id="lcities"
            value={citiesText}
            onChange={(e) => setCitiesText(e.target.value)}
            rows={3}
            placeholder="Chicago, IL&#10;Los Angeles, CA&#10;Miami, FL"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={run} disabled={pending || !query.trim() || !citiesText.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Check ranks
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
      </section>

      {rows && rows.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">
              Ranks for &ldquo;{rows[0].query}&rdquo;
            </h2>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">City</th>
                <th className="px-3 py-3 text-center font-medium">Position</th>
                <th className="px-3 py-3 text-center font-medium">Map pack</th>
                <th className="px-5 py-3 text-left font-medium">Ranking URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-white/[0.03]">
                  <td className="px-5 py-3 font-medium">{r.city}</td>
                  <td className="px-3 py-3 text-center">
                    <PositionBadge pos={r.position} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {r.mapPackPresent ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
                        <Map className="size-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {r.resultUrl ? (
                      <a
                        href={r.resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate hover:underline"
                      >
                        {r.resultUrl.replace(/^https?:\/\//, "").slice(0, 60)}
                        <ExternalLink className="size-3 text-muted-foreground" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">
                        Not in top 50
                      </span>
                    )}
                    {r.error && (
                      <div className="text-[11px] text-rose-300">{r.error}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function PositionBadge({ pos }: { pos: number | null }) {
  if (pos === null) {
    return (
      <span className="inline-flex h-6 w-12 items-center justify-center rounded text-xs text-muted-foreground">
        —
      </span>
    );
  }
  let cls = "bg-rose-500/10 text-rose-300 ring-rose-500/30";
  if (pos <= 3) cls = "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30";
  else if (pos <= 10)
    cls = "bg-amber-500/10 text-amber-300 ring-amber-500/30";
  else if (pos <= 20)
    cls = "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30";
  return (
    <span
      className={`inline-flex h-6 min-w-[3rem] items-center justify-center rounded-md px-2 text-xs font-bold tabular-nums ring-1 ring-inset ${cls}`}
    >
      #{pos}
    </span>
  );
}
