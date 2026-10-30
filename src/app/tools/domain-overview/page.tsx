"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { HelpLink } from "@/components/shell/help-link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  runDomainOverview,
  type DomainOverviewResult,
} from "./actions";

const externalCheckers = [
  {
    name: "Moz Domain Authority",
    note: "DA, linking domains, spam score",
    href: "https://moz.com/domain-analysis",
  },
  {
    name: "Ahrefs Free Backlink Checker",
    note: "Top backlinks, DR, anchor text",
    href: "https://ahrefs.com/backlink-checker",
  },
  {
    name: "Ubersuggest Domain Overview",
    note: "Traffic estimate, top pages, keywords (free 3/day)",
    href: "https://neilpatel.com/ubersuggest/",
  },
  {
    name: "Semrush Domain Overview",
    note: "Authority score, organic traffic est. (free with signup)",
    href: "https://www.semrush.com/analytics/overview/",
  },
  {
    name: "Wayback Machine",
    note: "How long the domain has been live + how it looked",
    href: "https://web.archive.org/",
  },
  {
    name: "Whois Lookup (ICANN)",
    note: "Registrar, registration date, owner if not private",
    href: "https://lookup.icann.org/",
  },
  {
    name: "SecurityHeaders.com",
    note: "Defensive HTTP-header grade A-F",
    href: "https://securityheaders.com/",
  },
  {
    name: "SSL Labs",
    note: "TLS / SSL certificate grade A+ to F",
    href: "https://www.ssllabs.com/ssltest/",
  },
  {
    name: "Google PageSpeed Insights",
    note: "Real-world Core Web Vitals + lighthouse",
    href: "https://pagespeed.web.dev/",
  },
  {
    name: "Mobile-Friendly Test",
    note: "Google's official mobile usability check",
    href: "https://search.google.com/test/mobile-friendly",
  },
];

export default function DomainOverviewPage() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<DomainOverviewResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!url.trim()) return;
    setResult(null);
    startTransition(async () => {
      const r = await runDomainOverview(url);
      setResult(r);
    });
  }

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
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Globe className="size-5 text-violet-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Domain overview</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Run every signal we can check ourselves — HTTPS, security headers,
          schema, on-page basics, indexed-pages estimate, robots/sitemap. For
          paid metrics (DA, backlink count, organic traffic estimate), we link
          you to the best free external checkers.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <Label htmlFor="do-url" className="text-sm">
          Domain or page URL
        </Label>
        <div className="mt-2 flex gap-2">
          <Input
            id="do-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="example.com"
            className="flex-1"
            disabled={pending}
          />
          <Button onClick={run} disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Run overview
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
          {/* Identity */}
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <div className="flex items-start gap-3">
              {result.metadata.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.metadata.logoUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-lg bg-white/5 object-contain ring-1 ring-inset ring-white/10"
                  onError={(e) =>
                    ((e.currentTarget as HTMLImageElement).style.display = "none")
                  }
                />
              )}
              <div className="flex-1">
                <h2 className="text-lg font-semibold">
                  {result.metadata.name ?? new URL(result.finalUrl).hostname}
                </h2>
                <a
                  href={result.finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                >
                  {result.finalUrl}
                  <ExternalLink className="size-3" />
                </a>
                {result.metadata.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {result.metadata.description}
                  </p>
                )}
                {result.ageHint && (
                  <p className="mt-2 text-xs text-amber-300/80">
                    {result.ageHint}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Signal grid */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Signal
              label="HTTPS"
              value={result.https.enabled ? "Enabled" : "Missing"}
              ok={result.https.enabled}
              detail={
                result.https.redirectsToHttps === true
                  ? "HTTP redirects to HTTPS"
                  : result.https.redirectsToHttps === false
                    ? "HTTP serves directly (insecure)"
                    : null
              }
            />
            <Signal
              label="HSTS"
              value={result.headers.strictTransportSecurity ? "Yes" : "No"}
              ok={result.headers.strictTransportSecurity}
            />
            <Signal
              label="CSP"
              value={result.headers.contentSecurityPolicy ? "Yes" : "No"}
              ok={result.headers.contentSecurityPolicy}
            />
            <Signal
              label="Title length"
              value={`${result.page.titleLength} chars`}
              ok={
                result.page.titleLength >= 30 && result.page.titleLength <= 65
              }
              detail={
                result.page.titleLength === 0
                  ? "missing"
                  : result.page.titleLength > 65
                    ? "may truncate in SERP"
                    : null
              }
            />
            <Signal
              label="Description length"
              value={`${result.page.descriptionLength} chars`}
              ok={
                result.page.descriptionLength >= 70 &&
                result.page.descriptionLength <= 165
              }
              detail={
                result.page.descriptionLength === 0
                  ? "missing"
                  : result.page.descriptionLength > 165
                    ? "may truncate"
                    : null
              }
            />
            <Signal
              label="H1 count"
              value={String(result.page.h1Count)}
              ok={result.page.h1Count >= 1}
            />
            <Signal
              label="Canonical"
              value={result.page.hasCanonical ? "Set" : "Missing"}
              ok={result.page.hasCanonical}
            />
            <Signal
              label="Viewport"
              value={result.page.hasViewport ? "Set" : "Missing"}
              ok={result.page.hasViewport}
            />
            <Signal
              label="Indexability"
              value={result.page.isNoindex ? "noindex!" : "Indexable"}
              ok={!result.page.isNoindex}
            />
            <Signal
              label="Image alt coverage"
              value={
                result.page.imgCount === 0
                  ? "0 imgs"
                  : `${result.page.imgWithAlt} / ${result.page.imgCount}`
              }
              ok={
                result.page.imgCount === 0 ||
                result.page.imgWithAlt / result.page.imgCount >= 0.85
              }
            />
            <Signal
              label="Word count"
              value={String(result.page.wordCount)}
              ok={result.page.wordCount >= 300}
              detail={
                result.page.wordCount < 300 ? "thin content" : null
              }
            />
            <Signal
              label="Schema types"
              value={
                result.page.schemaTypes.length > 0
                  ? `${result.page.schemaTypes.length} found`
                  : "None"
              }
              ok={result.page.schemaTypes.length > 0}
              detail={
                result.page.schemaTypes.length > 0
                  ? result.page.schemaTypes.slice(0, 3).join(", ")
                  : null
              }
            />
            <Signal
              label="Internal links"
              value={String(result.page.internalLinks)}
              ok={result.page.internalLinks >= 5}
            />
            <Signal
              label="External links"
              value={String(result.page.externalLinks)}
              ok={true}
            />
            <Signal
              label="robots.txt + sitemaps"
              value={
                result.robots.found
                  ? `${result.robots.sitemapCount} sitemap${result.robots.sitemapCount === 1 ? "" : "s"}`
                  : "Missing"
              }
              ok={result.robots.found && result.robots.sitemapCount > 0}
            />
            <Signal
              label="Bing indexed (≈)"
              value={
                result.indexedEstimate !== null
                  ? result.indexedEstimate.toLocaleString()
                  : "?"
              }
              ok={result.indexedEstimate !== null && result.indexedEstimate > 0}
              detail="From Bing site: search"
            />
          </section>

          {/* Server info */}
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h2 className="text-base font-semibold">Server fingerprint</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <KV k="Server" v={result.headers.server} />
              <KV k="X-Powered-By" v={result.headers.xPoweredBy} />
              <KV k="X-Frame-Options" v={result.headers.xFrameOptions} />
            </dl>
          </section>

          {/* External checkers */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">
                Check what we can&apos;t (free external tools)
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                DA / DR, real backlink counts, organic traffic estimates, and
                full SSL/security grades require third-party indexes. These
                links open with{" "}
                <code className="rounded bg-white/5 px-1">
                  {new URL(result.finalUrl).hostname}
                </code>{" "}
                pre-filled where possible.
              </p>
            </header>
            <ul className="divide-y divide-white/[0.04]">
              {externalCheckers.map((c) => {
                const host = new URL(result.finalUrl).hostname;
                const link = c.href.includes("ssllabs")
                  ? `${c.href}analyze.html?d=${encodeURIComponent(host)}`
                  : c.href.includes("securityheaders")
                    ? `${c.href}?q=${encodeURIComponent(host)}`
                    : c.href.includes("pagespeed")
                      ? `${c.href}?url=${encodeURIComponent(result.finalUrl)}`
                      : c.href.includes("ahrefs.com/backlink-checker")
                        ? `${c.href}/?input=${encodeURIComponent(host)}`
                        : c.href;
                return (
                  <li key={c.name} className="px-5 py-3 text-sm">
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 transition-colors hover:bg-white/[0.02]"
                    >
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.note}
                        </div>
                      </div>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Signal({
  label,
  value,
  ok,
  detail,
}: {
  label: string;
  value: string;
  ok: boolean;
  detail?: string | null;
}) {
  return (
    <div className="glass-apple relative overflow-hidden rounded-2xl p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {ok ? (
          <CheckCircle2 className="size-3.5 text-emerald-400" />
        ) : (
          <XCircle className="size-3.5 text-rose-400" />
        )}
      </div>
      <div className="mt-1 truncate text-base font-semibold">{value}</div>
      {detail && (
        <div className="text-[11px] text-muted-foreground">{detail}</div>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {k}
      </dt>
      <dd className="font-mono text-xs">{v ?? "(not set)"}</dd>
    </div>
  );
}
