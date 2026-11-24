"use client";

import { ToolBackLink } from "@/components/tools/tool-back-link";
import { useState, useTransition } from "react";
import { usePresetUrl } from "@/components/use-preset-url";
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Copy,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale, useTranslations } from "next-intl";
import { generateSchema, type SchemaType } from "./actions";
import { getSchemaAdvisory } from "@/lib/schema-deprecations-2026";
import { NO_ADVISORY_FR, SCHEMA_ADVISORIES_FR } from "@/lib/schema-deprecations-2026.fr";

const TYPES: SchemaType[] = [
  "Article",
  "LocalBusiness",
  "FAQPage",
  "Product",
  "Recipe",
  "Event",
  "Organization",
];

export default function SchemaGeneratorPage() {
  const t = useTranslations("tools.ui.schema");
  const tCommon = useTranslations("tools.common");
  const [type, setType] = useState<SchemaType>("Article");
  // Seeded from ?url= so opening this from a client keeps the client.
  const [url, setUrl] = useState(usePresetUrl());
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [jsonld, setJsonld] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function run() {
    setError(null);
    setJsonld(null);
    startTransition(async () => {
      const r = await generateSchema({ type, url, notes });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setJsonld(r.jsonld);
    });
  }

  function copy() {
    if (!jsonld) return;
    navigator.clipboard.writeText(jsonld).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ToolBackLink />

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-400/30">
            <Code2 className="size-5 text-cyan-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">{t("title")}</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t.rich("intro", {
            code: () => (
              <code className="rounded bg-white/5 px-1 py-0.5 text-xs">&lt;head&gt;</code>
            ),
          })}
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl space-y-4 p-5">
        <div className="space-y-1.5">
          <Label>{t("schemaType")}</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TYPES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setType(id)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  type === id
                    ? "border-violet-500/40 bg-violet-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="text-sm font-medium">{id}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t(`types.${id}`)}
                </div>
              </button>
            ))}
          </div>
        </div>

        <SchemaAdvisoryBanner type={type} />

        <div className="space-y-1.5">
          <Label htmlFor="surl">{t("pageUrl")}</Label>
          <Input
            id="surl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yoursite.com/page"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="snotes">{t("extraNotes")}</Label>
          <textarea
            id="snotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t("notesPlaceholder")}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={run} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("generating")}
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {t("generate")}
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

      {jsonld && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <SchemaAdvisoryBanner type={type} compact />
          <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CheckCircle2 className="size-4 text-emerald-300" />
              {t("generatedJsonLd")}
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              <Copy className="size-3.5" />
              {copied ? tCommon("copied") : tCommon("copy")}
            </Button>
          </header>
          <div className="space-y-3 p-5">
            <pre className="overflow-x-auto rounded-md border border-white/10 bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-foreground/90">
              {jsonld}
            </pre>
            <div className="rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-muted-foreground">
              {t.rich("howToUse", {
                strong: (chunks) => (
                  <strong className="text-violet-200">{chunks}</strong>
                ),
                script: () => (
                  <code className="rounded bg-white/5 px-1 py-0.5">
                    &lt;script type=&quot;application/ld+json&quot;&gt;...&lt;/script&gt;
                  </code>
                ),
                head: () => (
                  <code className="rounded bg-white/5 px-1 py-0.5">&lt;head&gt;</code>
                ),
                link: (chunks) => (
                  <a
                    href="https://search.google.com/test/rich-results"
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-300 underline-offset-2 hover:underline"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SchemaAdvisoryBanner({
  type,
  compact = false,
}: {
  type: SchemaType;
  compact?: boolean;
}) {
  const t = useTranslations("tools.ui.schema");
  const locale = useLocale();
  // French text from the table next to the English one, same keys.
  const advisory = {
    ...getSchemaAdvisory(type),
    ...(locale === "fr" ? (SCHEMA_ADVISORIES_FR[type] ?? NO_ADVISORY_FR) : {}),
  };
  if (advisory.status === "ok") {
    if (compact) return null;
    return (
      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
        <p className="font-medium text-emerald-300">
          ✓ {advisory.headline}
        </p>
        {advisory.recommendation && (
          <p className="mt-1 text-muted-foreground">
            {advisory.recommendation}
          </p>
        )}
      </div>
    );
  }
  const tone =
    advisory.status === "deprecated"
      ? "border-rose-500/30 bg-rose-500/5 text-rose-200"
      : "border-amber-500/30 bg-amber-500/5 text-amber-200";
  return (
    <div className={`${compact ? "border-b border-white/[0.06] px-5 py-3" : "rounded-md border px-3 py-2"} ${tone} text-xs`}>
      <p className="font-medium">
        {advisory.status === "deprecated" ? t("deprecated") : t("reducedDisplay")}{" "}
        {advisory.headline}
      </p>
      <p className="mt-1 opacity-80">{advisory.reason}</p>
      {advisory.recommendation && (
        <p className="mt-1.5 opacity-90">
          <strong className="font-medium">{t("recommendation")}</strong>{" "}
          {advisory.recommendation}
        </p>
      )}
    </div>
  );
}
