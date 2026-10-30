"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HelpLink } from "@/components/shell/help-link";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Each tool declares how to convert a user input (a domain/URL or a keyword)
 * into the right deep-link. Some tools need a hostname, some take a full URL,
 * some accept either — we normalize.
 */
type Tool = {
  name: string;
  /** What clicking actually gives you, in plain language. */
  whatItDoes: string;
  /** Display category. */
  category: string;
  pricing: "free" | "free-tier" | "paid-trial";
  /** Build the URL from user input. Receives normalized {hostname, fullUrl, keyword}. */
  build: (ctx: {
    hostname: string;
    fullUrl: string;
    keyword: string;
  }) => string;
  /** Which input field is required. */
  requires: "hostname" | "fullUrl" | "keyword";
};

const tools: Tool[] = [
  // === Authority / backlinks (the paid metric we can't replicate) ===
  {
    name: "Moz Free Domain Analysis",
    whatItDoes:
      "Get the Domain Authority (DA) score, top linking domains, spam score, and the keywords this domain ranks for.",
    category: "Authority + backlinks",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://moz.com/domain-analysis?site=${encodeURIComponent(hostname)}`,
  },
  {
    name: "Ahrefs Free Backlink Checker",
    whatItDoes:
      "See the top 100 backlinks pointing at this domain, their Domain Rating, and the anchor text used.",
    category: "Authority + backlinks",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://ahrefs.com/backlink-checker/?input=${encodeURIComponent(hostname)}&mode=subdomains`,
  },
  {
    name: "OpenLinkProfiler",
    whatItDoes:
      "Free real-time backlink index — daily-refreshed list of every link they could find pointing at this domain.",
    category: "Authority + backlinks",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://www.openlinkprofiler.org/r/${encodeURIComponent(hostname)}`,
  },
  {
    name: "Ubersuggest Domain Overview",
    whatItDoes:
      "Estimated organic traffic, top pages, top keywords, and a 'SEO Difficulty' for the domain. Free 3 lookups/day.",
    category: "Authority + backlinks",
    pricing: "free-tier",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://app.neilpatel.com/en/seo_analyzer/site_audit?domain=${encodeURIComponent(hostname)}`,
  },
  {
    name: "Semrush Domain Overview",
    whatItDoes:
      "Authority score, organic traffic estimate, keyword count, top organic competitors. Free with signup.",
    category: "Authority + backlinks",
    pricing: "paid-trial",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://www.semrush.com/analytics/overview/?q=${encodeURIComponent(hostname)}&searchType=domain`,
  },

  // === Keyword research ===
  {
    name: "Google Keyword Planner",
    whatItDoes:
      "Real Google search volumes, suggested CPC, and seasonal trends. Free with any Google Ads account.",
    category: "Keyword research",
    pricing: "free",
    requires: "keyword",
    build: () => `https://ads.google.com/aw/keywordplanner`,
  },
  {
    name: "Google Trends",
    whatItDoes:
      "Search interest over time + regional breakdown + related queries. Best for spotting rising / falling demand.",
    category: "Keyword research",
    pricing: "free",
    requires: "keyword",
    build: ({ keyword }) =>
      `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}`,
  },
  {
    name: "AnswerThePublic",
    whatItDoes:
      "Auto-completes turned into question / preposition / comparison clusters — content brief gold.",
    category: "Keyword research",
    pricing: "free-tier",
    requires: "keyword",
    build: ({ keyword }) =>
      `https://answerthepublic.com/reports/new?language=en&country=us&keyword=${encodeURIComponent(keyword)}`,
  },
  {
    name: "AlsoAsked",
    whatItDoes:
      "Maps People-Also-Ask cluster trees — see how Google groups related questions. Free 3/day.",
    category: "Keyword research",
    pricing: "free-tier",
    requires: "keyword",
    build: ({ keyword }) =>
      `https://alsoasked.com/search?term=${encodeURIComponent(keyword)}&language=en&region=us`,
  },
  {
    name: "Keyworddit (Reddit-mined)",
    whatItDoes:
      "Pulls keywords mined from Reddit threads — language real humans actually use, not what AI tools predict.",
    category: "Keyword research",
    pricing: "free",
    requires: "keyword",
    build: () => `https://keyworddit.com/`,
  },

  // === Performance / Core Web Vitals ===
  {
    name: "Google PageSpeed Insights",
    whatItDoes:
      "Real-world Core Web Vitals (LCP / INP / CLS) from CrUX + lab Lighthouse audit + concrete fix suggestions.",
    category: "Performance",
    pricing: "free",
    requires: "fullUrl",
    build: ({ fullUrl }) =>
      `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(fullUrl)}`,
  },
  {
    name: "GTmetrix",
    whatItDoes:
      "Waterfall + opportunity report. Free 3 tests/day, no signup. Useful second opinion vs PSI.",
    category: "Performance",
    pricing: "free-tier",
    requires: "fullUrl",
    build: ({ fullUrl }) =>
      `https://gtmetrix.com/?url=${encodeURIComponent(fullUrl)}`,
  },
  {
    name: "WebPageTest",
    whatItDoes:
      "Multi-location detailed performance run — slowest network types, video filmstrip, deep waterfall. Free.",
    category: "Performance",
    pricing: "free",
    requires: "fullUrl",
    build: ({ fullUrl }) =>
      `https://www.webpagetest.org/?url=${encodeURIComponent(fullUrl)}`,
  },
  {
    name: "Google Mobile-Friendly Test",
    whatItDoes:
      "Pass / fail + screenshot of how Google renders this URL on a phone. Catches mobile-only issues.",
    category: "Performance",
    pricing: "free",
    requires: "fullUrl",
    build: ({ fullUrl }) =>
      `https://search.google.com/test/mobile-friendly?url=${encodeURIComponent(fullUrl)}`,
  },

  // === Schema / structured data ===
  {
    name: "Google Rich Results Test",
    whatItDoes:
      "Validates JSON-LD + previews which rich result types this URL is eligible for (FAQ, Recipe, Product, etc.).",
    category: "Schema + structured data",
    pricing: "free",
    requires: "fullUrl",
    build: ({ fullUrl }) =>
      `https://search.google.com/test/rich-results?url=${encodeURIComponent(fullUrl)}`,
  },
  {
    name: "Schema.org Validator",
    whatItDoes:
      "Strictly validates JSON-LD against the schema.org spec — catches type errors Rich Results Test ignores.",
    category: "Schema + structured data",
    pricing: "free",
    requires: "fullUrl",
    build: ({ fullUrl }) =>
      `https://validator.schema.org/#url=${encodeURIComponent(fullUrl)}`,
  },

  // === Security ===
  {
    name: "Mozilla Observatory",
    whatItDoes:
      "Grades security headers A+ to F with concrete checklist (HSTS, CSP, X-Frame-Options, etc.).",
    category: "Security",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://developer.mozilla.org/en-US/observatory/analyze?host=${encodeURIComponent(hostname)}`,
  },
  {
    name: "Qualys SSL Labs",
    whatItDoes:
      "Detailed TLS / SSL grade A+ to F. Slow (~2 min) but the gold standard for cert + cipher analysis.",
    category: "Security",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(hostname)}&hideResults=on`,
  },
  {
    name: "SecurityHeaders.com",
    whatItDoes:
      "Quick HTTP-header grade by Scott Helme. Faster than Observatory; good for daily checks.",
    category: "Security",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://securityheaders.com/?q=${encodeURIComponent(hostname)}&followRedirects=on`,
  },

  // === Indexing + crawl ===
  {
    name: "Google Search Console",
    whatItDoes:
      "Indexing status, manual actions, sitemaps, performance — Google's own truth source. Free, requires verification.",
    category: "Indexing + crawl",
    pricing: "free",
    requires: "hostname",
    build: () => `https://search.google.com/search-console`,
  },
  {
    name: "Bing Webmaster Tools",
    whatItDoes:
      "Bing's GSC equivalent + a free SEO audit. Underused — easy free wins for audit reports.",
    category: "Indexing + crawl",
    pricing: "free",
    requires: "hostname",
    build: () => `https://www.bing.com/webmasters/home`,
  },
  {
    name: "Bing site: search",
    whatItDoes:
      "Quickest indexed-pages estimate. We auto-do this in /tools/domain-overview but it's worth eyeballing.",
    category: "Indexing + crawl",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://www.bing.com/search?q=site%3A${encodeURIComponent(hostname)}`,
  },
  {
    name: "Google site: search",
    whatItDoes:
      "Google's indexed-pages eyeball. Less reliable than GSC's coverage report but instant.",
    category: "Indexing + crawl",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://www.google.com/search?q=site%3A${encodeURIComponent(hostname)}`,
  },

  // === History + ownership ===
  {
    name: "Wayback Machine",
    whatItDoes:
      "How long this domain has been live, what it looked like before, and whether prior owners spammed it.",
    category: "History + ownership",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://web.archive.org/web/*/${encodeURIComponent(hostname)}`,
  },
  {
    name: "ICANN Whois Lookup",
    whatItDoes:
      "Domain registration date, registrar, owner if not WHOIS-private. Reveals domain age.",
    category: "History + ownership",
    pricing: "free",
    requires: "hostname",
    build: ({ hostname }) =>
      `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(hostname)}`,
  },

  // === AI search visibility ===
  {
    name: "Perplexity",
    whatItDoes:
      "Citation-first AI search. Test which of your tracked queries cite your domain in answers.",
    category: "AI search visibility",
    pricing: "free-tier",
    requires: "keyword",
    build: ({ keyword }) =>
      `https://www.perplexity.ai/search?q=${encodeURIComponent(keyword)}`,
  },
  {
    name: "ChatGPT (web search)",
    whatItDoes:
      "Manually test whether ChatGPT cites your site for tracked queries. Search-mode required.",
    category: "AI search visibility",
    pricing: "free-tier",
    requires: "keyword",
    build: ({ keyword }) =>
      `https://chatgpt.com/?q=${encodeURIComponent(keyword)}`,
  },
  {
    name: "Google AI Overviews check",
    whatItDoes:
      "Plain Google search — note when AIO appears + which sources it cites. Cross-check our SERP scanner.",
    category: "AI search visibility",
    pricing: "free",
    requires: "keyword",
    build: ({ keyword }) =>
      `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
  },
];

const categories = Array.from(new Set(tools.map((t) => t.category)));

const pricingTone: Record<Tool["pricing"], string> = {
  free: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  "free-tier": "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  "paid-trial": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

function normalize(input: string): {
  hostname: string;
  fullUrl: string;
  keyword: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { hostname: "", fullUrl: "", keyword: "" };

  // If it looks like a URL or domain, parse it
  const looksLikeUrl =
    /^https?:\/\//i.test(trimmed) ||
    /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(trimmed);
  if (looksLikeUrl) {
    try {
      const url = new URL(
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
      );
      return {
        hostname: url.hostname.replace(/^www\./, ""),
        fullUrl: url.toString(),
        keyword: trimmed,
      };
    } catch {
      // fall through
    }
  }

  // Treat as keyword
  return { hostname: "", fullUrl: "", keyword: trimmed };
}

export default function ExternalToolsLaunchpadPage() {
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<"all" | "domain" | "keyword">("all");

  const ctx = useMemo(() => normalize(input), [input]);
  const hasUrl = !!ctx.hostname;
  const hasKw = !!ctx.keyword;

  const visibleTools = tools.filter((t) => {
    if (filter === "domain") return t.requires !== "keyword";
    if (filter === "keyword") return t.requires === "keyword";
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/*
        The back link and the help button share a row.

        These pages hand-roll their header instead of using PageHeader,
        which is where <HelpLink /> normally lives — so 18 of the 92
        tools had no way to reach their documentation at all. The help
        link resolves the current route to that tool's own anchor on the
        reference page.
      */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          All tools
        </Link>
        <HelpLink />
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-400/30">
            <Globe className="size-5 text-cyan-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">External tools launchpad</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste a URL or keyword <strong>once</strong>. Every tool below opens
          with your context pre-filled — no retyping. Use this for the metrics
          we can&apos;t compute ourselves (real DA, full backlink index, SSL
          grade, search volume).
        </p>
      </header>

      {/* Single input */}
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <Label htmlFor="ext-input" className="text-sm">
          URL, domain, or keyword
        </Label>
        <div className="mt-2 flex gap-2">
          <Input
            id="ext-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="example.com  ·  https://example.com/page  ·  best espresso machine"
            className="flex-1"
          />
          {input && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setInput("")}
            >
              Clear
            </Button>
          )}
        </div>
        {input && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Detected hostname:{" "}
              <span className={hasUrl ? "text-emerald-300" : "text-rose-300/80"}>
                {ctx.hostname || "(none — keyword tools only)"}
              </span>
            </span>
            <span>
              Detected URL:{" "}
              <span className={hasUrl ? "text-emerald-300" : "text-rose-300/80"}>
                {ctx.fullUrl || "(none)"}
              </span>
            </span>
            <span>
              As keyword:{" "}
              <span className="text-cyan-300">{ctx.keyword || "(none)"}</span>
            </span>
          </div>
        )}

        <div className="mt-3 flex items-center gap-1 rounded-full bg-white/5 p-0.5 ring-1 ring-inset ring-white/10 w-fit">
          {(["all", "domain", "keyword"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? "rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground"
                  : "rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {f === "all" ? "All" : f === "domain" ? "Domain tools" : "Keyword tools"}
            </button>
          ))}
        </div>
      </section>

      {!input && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] px-4 py-3 text-sm text-muted-foreground">
          <Search className="mr-2 inline size-4 text-cyan-300" />
          Enter a URL or keyword above — each tool below will open with that
          input pre-filled where the tool supports it.
        </div>
      )}

      {/* Tools by category */}
      {categories
        .filter((cat) => visibleTools.some((t) => t.category === cat))
        .map((cat) => {
          const items = visibleTools.filter((t) => t.category === cat);
          return (
            <section
              key={cat}
              className="glass-apple relative overflow-hidden rounded-2xl"
            >
              <header className="border-b border-white/[0.06] px-5 py-3.5">
                <h2 className="text-base font-semibold">{cat}</h2>
                <p className="text-[11px] text-muted-foreground">
                  {items.length} tool{items.length === 1 ? "" : "s"}
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {items.map((t) => {
                  const requirementMet =
                    (t.requires === "hostname" && hasUrl) ||
                    (t.requires === "fullUrl" && hasUrl) ||
                    (t.requires === "keyword" && hasKw);
                  const link = requirementMet
                    ? t.build(ctx)
                    : t.build({ hostname: "", fullUrl: "", keyword: "" });
                  const disabled = !!input && !requirementMet;
                  return (
                    <li
                      key={t.name}
                      className={`px-5 py-3 text-sm ${disabled ? "opacity-40" : ""}`}
                    >
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className={`group flex items-start justify-between gap-3 transition-colors ${
                          disabled ? "pointer-events-none" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium group-hover:underline">
                              {t.name}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ring-inset ${pricingTone[t.pricing]}`}
                            >
                              {t.pricing.replace("-", " ")}
                            </span>
                            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground ring-1 ring-inset ring-white/10">
                              needs {t.requires === "fullUrl" ? "URL" : t.requires}
                            </span>
                            {disabled && (
                              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300 ring-1 ring-inset ring-rose-500/30">
                                input mismatch
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t.whatItDoes}
                          </p>
                        </div>
                        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
    </div>
  );
}
