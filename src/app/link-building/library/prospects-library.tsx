"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import type {
  Prospect,
  ProspectCategory,
} from "@/lib/backlink-prospects-data";

type Props = {
  prospects: Prospect[];
  categoryLabels: Record<ProspectCategory, string>;
  countryLabels: Record<string, string>;
  nicheLabels: Record<string, string>;
};

const COST_COLORS: Record<string, string> = {
  free: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  freemium: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  paid: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

const LINK_COLORS: Record<string, string> = {
  dofollow: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  nofollow: "bg-muted-foreground/10 text-muted-foreground ring-white/10",
  mixed: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
};

export function ProspectsLibrary({
  prospects,
  categoryLabels,
  countryLabels,
  nicheLabels,
}: Props) {
  const tx = useTranslations("ui.app_link-building_library_prospects-library");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<string>("");
  const [niche, setNiche] = useState<string>("");
  const [category, setCategory] = useState<ProspectCategory | "">("");
  const [cost, setCost] = useState<string>("");
  const [linkType, setLinkType] = useState<string>("");
  const [minDa, setMinDa] = useState(0);
  const [maxDiff, setMaxDiff] = useState(5);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  // Derive options that actually exist in the data.
  const allCountries = useMemo(() => {
    const set = new Set<string>();
    for (const p of prospects) for (const c of p.countries) set.add(c);
    return Array.from(set).sort();
  }, [prospects]);

  const allNiches = useMemo(() => {
    const set = new Set<string>();
    for (const p of prospects) for (const n of p.niches) set.add(n);
    return Array.from(set).sort();
  }, [prospects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q))
        return false;
      if (category && p.category !== category) return false;
      if (cost && p.cost !== cost) return false;
      if (linkType && p.linkType !== linkType) return false;
      if (p.da < minDa) return false;
      if (p.difficulty > maxDiff) return false;
      if (niche && !p.niches.includes(niche)) return false;
      if (country) {
        // Empty countries = global, always match. Otherwise must include
        // the selected country.
        if (p.countries.length > 0 && !p.countries.includes(country)) return false;
      }
      return true;
    });
  }, [prospects, search, category, cost, linkType, minDa, maxDiff, niche, country]);

  // Group by category for clean rendering.
  const grouped = useMemo(() => {
    const m = new Map<ProspectCategory, Prospect[]>();
    for (const p of filtered) {
      const list = m.get(p.category) ?? [];
      list.push(p);
      m.set(p.category, list);
    }
    return Array.from(m.entries()).sort(
      (a, b) => b[1].length - a[1].length,
    );
  }, [filtered]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyLink = (url: string, key: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const reset = () => {
    setSearch("");
    setCountry("");
    setNiche("");
    setCategory("");
    setCost("");
    setLinkType("");
    setMinDa(0);
    setMaxDiff(5);
  };

  return (
    <>
      {/* Filters */}
      <section className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{tx("search")}</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tx("nameOrDescription")}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{tx("country")}</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="">{tx("anyInclGlobal")}</option>
              {allCountries.map((c) => (
                <option key={c} value={c}>
                  {countryLabels[c] ?? c}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{tx("niche")}</span>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="">{tx("any")}</option>
              {allNiches.map((n) => (
                <option key={n} value={n}>
                  {nicheLabels[n] ?? n}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{tx("category")}</span>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as ProspectCategory | "")
              }
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="">{tx("any")}</option>
              {Object.entries(categoryLabels).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{tx("cost")}</span>
            <select
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="">{tx("any")}</option>
              <option value="free">{tx("freeOnly")}</option>
              <option value="freemium">{tx("freemium")}</option>
              <option value="paid">{tx("paid")}</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{tx("linkType")}</span>
            <select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="">{tx("any")}</option>
              <option value="dofollow">{tx("dofollowOnly")}</option>
              <option value="nofollow">{tx("nofollow")}</option>
              <option value="mixed">{tx("mixed")}</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{tx("minDa", { minDa })}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={minDa}
              onChange={(e) => setMinDa(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">
              {tx("maxDifficulty5", { maxDiff })}
            </span>
            <input
              type="range"
              min={1}
              max={5}
              value={maxDiff}
              onChange={(e) => setMaxDiff(Number(e.target.value))}
              className="w-full"
            />
          </label>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {tx("showingOf", { length: filtered.length, length2: prospects.length })}
          </span>
          <button
            type="button"
            onClick={reset}
            className="rounded-md px-2 py-1 text-violet-300 hover:bg-white/5"
          >
            {tx("resetFilters")}
          </button>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="glass-apple rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          {tx("noProspectsMatchThoseFilters")}
        </div>
      ) : (
        grouped.map(([cat, list]) => (
          <section
            key={cat}
            className="glass-apple relative overflow-hidden rounded-2xl"
          >
            <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <h3 className="text-sm font-semibold">
                {categoryLabels[cat]} ({list.length})
              </h3>
            </header>
            <ul className="divide-y divide-white/[0.06]">
              {list
                .sort((a, b) => b.da - a.da)
                .map((p, i) => {
                  const key = `${cat}-${i}`;
                  const isExpanded = expanded.has(key);
                  return (
                    <li key={key} className="px-5 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{p.name}</p>
                            <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-mono text-violet-300 ring-1 ring-inset ring-violet-500/30">
                              {tx("da", { da: p.da })}
                            </span>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${COST_COLORS[p.cost]}`}
                            >
                              {tx(`costBadge.${p.cost}`)}
                            </span>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${LINK_COLORS[p.linkType]}`}
                            >
                              {tx(`linkBadge.${p.linkType}`)}
                            </span>
                            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10">
                              {tx("n5Min", { difficulty: p.difficulty, submissionTimeMin: p.submissionTimeMin })}
                            </span>
                            {p.countries.length > 0 && (
                              <span className="rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
                                {p.countries
                                  .map((c) => countryLabels[c] ?? c)
                                  .slice(0, 3)
                                  .join(", ")}
                                {p.countries.length > 3
                                  ? ` +${p.countries.length - 3}`
                                  : ""}
                              </span>
                            )}
                            {p.niches.map((n) => (
                              <span
                                key={n}
                                className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10"
                              >
                                {nicheLabels[n] ?? n}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {p.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20"
                            >
                              {tx("open")}
                              <ExternalLink className="size-2.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => copyLink(p.url, key)}
                              className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
                            >
                              {copied === key ? (
                                <>
                                  <Check className="size-2.5" /> {tx("copied")}
                                </>
                              ) : (
                                <>
                                  <Copy className="size-2.5" /> {tx("copyUrl")}
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleExpand(key)}
                              className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-0.5 text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronDown className="size-2.5" /> {tx("hideSteps")}
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="size-2.5" /> {tx("howToSubmit")}
                                </>
                              )}
                            </button>
                          </div>
                          {isExpanded && (
                            <ol className="mt-2 space-y-1 rounded-md bg-white/[0.03] p-2 text-[11px] ring-1 ring-inset ring-white/5">
                              {p.howTo.map((step, j) => (
                                <li key={j} className="flex gap-2">
                                  <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[9px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                                    {j + 1}
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
