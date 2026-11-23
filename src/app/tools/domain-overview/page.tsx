"use client";

import { usePresetUrl } from "@/components/use-preset-url";
import { ToolBackLink } from "@/components/tools/tool-back-link";
import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
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
    note: "moz",
    href: "https://moz.com/domain-analysis",
  },
  {
    name: "Ahrefs Free Backlink Checker",
    note: "ahrefs",
    href: "https://ahrefs.com/backlink-checker",
  },
  {
    name: "Ubersuggest Domain Overview",
    note: "ubersuggest",
    href: "https://neilpatel.com/ubersuggest/",
  },
  {
    name: "Semrush Domain Overview",
    note: "semrush",
    href: "https://www.semrush.com/analytics/overview/",
  },
  {
    name: "Wayback Machine",
    note: "wayback",
    href: "https://web.archive.org/",
  },
  {
    name: "Whois Lookup (ICANN)",
    note: "whois",
    href: "https://lookup.icann.org/",
  },
  {
    name: "SecurityHeaders.com",
    note: "securityHeaders",
    href: "https://securityheaders.com/",
  },
  {
    name: "SSL Labs",
    note: "sslLabs",
    href: "https://www.ssllabs.com/ssltest/",
  },
  {
    name: "Google PageSpeed Insights",
    note: "pageSpeed",
    href: "https://pagespeed.web.dev/",
  },
  {
    name: "Mobile-Friendly Test",
    note: "mobileFriendly",
    href: "https://search.google.com/test/mobile-friendly",
  },
];

export default function DomainOverviewPage() {
  const t = useTranslations("tools.ui.domain-overview");
  const locale = useLocale();
  const [url, setUrl] = useState(usePresetUrl());
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
      <ToolBackLink />

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Globe className="size-5 text-violet-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">{t("title")}</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <Label htmlFor="do-url" className="text-sm">
          {t("urlLabel")}
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
                {t("scanning")}
              </>
            ) : (
              <>
                <Search className="size-4" />
                {t("submit")}
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
              value={result.https.enabled ? t("enabled") : t("missing")}
              ok={result.https.enabled}
              detail={
                result.https.redirectsToHttps === true
                  ? t("httpRedirects")
                  : result.https.redirectsToHttps === false
                    ? t("httpInsecure")
                    : null
              }
            />
            <Signal
              label="HSTS"
              value={result.headers.strictTransportSecurity ? t("yes") : t("no")}
              ok={result.headers.strictTransportSecurity}
            />
            <Signal
              label="CSP"
              value={result.headers.contentSecurityPolicy ? t("yes") : t("no")}
              ok={result.headers.contentSecurityPolicy}
            />
            <Signal
              label={t("titleLength")}
              value={t("chars", { count: result.page.titleLength })}
              ok={
                result.page.titleLength >= 30 && result.page.titleLength <= 65
              }
              detail={
                result.page.titleLength === 0
                  ? t("missingLower")
                  : result.page.titleLength > 65
                    ? t("mayTruncateSerp")
                    : null
              }
            />
            <Signal
              label={t("descriptionLength")}
              value={t("chars", { count: result.page.descriptionLength })}
              ok={
                result.page.descriptionLength >= 70 &&
                result.page.descriptionLength <= 165
              }
              detail={
                result.page.descriptionLength === 0
                  ? t("missingLower")
                  : result.page.descriptionLength > 165
                    ? t("mayTruncate")
                    : null
              }
            />
            <Signal
              label={t("h1Count")}
              value={String(result.page.h1Count)}
              ok={result.page.h1Count >= 1}
            />
            <Signal
              label="Canonical"
              value={result.page.hasCanonical ? t("set") : t("missing")}
              ok={result.page.hasCanonical}
            />
            <Signal
              label="Viewport"
              value={result.page.hasViewport ? t("set") : t("missing")}
              ok={result.page.hasViewport}
            />
            <Signal
              label={t("indexability")}
              value={result.page.isNoindex ? t("noindex") : t("indexable")}
              ok={!result.page.isNoindex}
            />
            <Signal
              label={t("altCoverage")}
              value={
                result.page.imgCount === 0
                  ? t("zeroImages")
                  : `${result.page.imgWithAlt} / ${result.page.imgCount}`
              }
              ok={
                result.page.imgCount === 0 ||
                result.page.imgWithAlt / result.page.imgCount >= 0.85
              }
            />
            <Signal
              label={t("wordCount")}
              value={String(result.page.wordCount)}
              ok={result.page.wordCount >= 300}
              detail={
                result.page.wordCount < 300 ? t("thinContent") : null
              }
            />
            <Signal
              label={t("schemaTypes")}
              value={
                result.page.schemaTypes.length > 0
                  ? t("found", { count: result.page.schemaTypes.length })
                  : t("none")
              }
              ok={result.page.schemaTypes.length > 0}
              detail={
                result.page.schemaTypes.length > 0
                  ? result.page.schemaTypes.slice(0, 3).join(", ")
                  : null
              }
            />
            <Signal
              label={t("internalLinks")}
              value={String(result.page.internalLinks)}
              ok={result.page.internalLinks >= 5}
            />
            <Signal
              label={t("externalLinks")}
              value={String(result.page.externalLinks)}
              ok={true}
            />
            <Signal
              label={t("robotsSitemaps")}
              value={
                result.robots.found
                  ? t("sitemaps", { count: result.robots.sitemapCount })
                  : t("missing")
              }
              ok={result.robots.found && result.robots.sitemapCount > 0}
            />
            <Signal
              label={t("bingIndexed")}
              value={
                result.indexedEstimate !== null
                  ? result.indexedEstimate.toLocaleString(locale)
                  : "?"
              }
              ok={result.indexedEstimate !== null && result.indexedEstimate > 0}
              detail={t("bingIndexedDetail")}
            />
          </section>

          {/* Server info */}
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h2 className="text-base font-semibold">{t("serverFingerprint")}</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <KV k="Server" v={result.headers.server} notSet={t("notSet")} />
              <KV k="X-Powered-By" v={result.headers.xPoweredBy} notSet={t("notSet")} />
              <KV k="X-Frame-Options" v={result.headers.xFrameOptions} notSet={t("notSet")} />
            </dl>
          </section>

          {/* External checkers */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">
                {t("externalTitle")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.rich("externalHint", {
                  host: new URL(result.finalUrl).hostname,
                  code: (chunks) => (
                    <code className="rounded bg-white/5 px-1">{chunks}</code>
                  ),
                })}
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
                          {t(`checkers.${c.note}`)}
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

function KV({ k, v, notSet }: { k: string; v: string | null; notSet: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {k}
      </dt>
      <dd className="font-mono text-xs">{v ?? notSet}</dd>
    </div>
  );
}
