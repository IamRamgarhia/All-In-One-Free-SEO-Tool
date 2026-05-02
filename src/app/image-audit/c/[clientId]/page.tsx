"use client";

import { useState, useTransition, use } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runImageAudit } from "@/app/image-audit/actions";
import type { ImageAuditResult, ImageIssue } from "@/lib/image-audit";

const ISSUE_LABEL: Record<ImageIssue, string> = {
  missing_alt: "No alt",
  empty_alt: "Empty alt",
  alt_too_long: "Alt > 125",
  alt_is_filename: "Alt is filename",
  no_dimensions: "No w/h",
  no_lazy_loading: "No lazy",
  legacy_format: "JPG/PNG",
  oversize: "Oversize",
  broken: "Broken",
};

const ISSUE_TONE: Record<ImageIssue, string> = {
  missing_alt: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  empty_alt: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  alt_too_long: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  alt_is_filename: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  no_dimensions: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  no_lazy_loading: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30",
  legacy_format: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30",
  oversize: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  broken: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export default function PerClientImageAudit({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  use(params); // satisfy the params Promise contract

  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImageAuditResult | null>(null);

  function run() {
    if (!url.trim()) return;
    setResult(null);
    startTransition(async () => {
      setResult(await runImageAudit(url));
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/image-audit"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All clients
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-400/30">
            <ImageIcon className="size-5 text-amber-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Image SEO audit</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Extracts every image from the page, then HEAD-checks each for size +
          format. Flags 9 distinct image-SEO issues per file.
        </p>
      </header>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="iurl">Page URL</Label>
            <Input
              id="iurl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/blog/post"
            />
          </div>
          <Button onClick={run} disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Auditing…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Audit
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
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="Total images" value={result.total} tone="violet" />
            <Tile
              label="With issues"
              value={result.withIssues}
              tone={result.withIssues === 0 ? "emerald" : "rose"}
            />
            <Tile
              label="Clean"
              value={result.total - result.withIssues}
              tone="emerald"
            />
          </div>

          {result.total === 0 ? (
            <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-8 text-center text-sm text-muted-foreground">
              No images found on this page.
            </div>
          ) : (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">Images</h2>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.images.map((img, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 px-5 py-3 text-sm"
                  >
                    <div className="size-12 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.src}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <a
                        href={img.src}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate font-mono text-[11px] hover:underline"
                      >
                        {img.src.replace(/^https?:\/\//, "").slice(0, 80)}
                        <ExternalLink className="size-3 text-muted-foreground" />
                      </a>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {img.format && (
                          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-muted-foreground ring-1 ring-inset ring-white/10">
                            {img.format}
                          </span>
                        )}
                        {img.sizeBytes !== null && (
                          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-muted-foreground ring-1 ring-inset ring-white/10">
                            {(img.sizeBytes / 1024).toFixed(0)}KB
                          </span>
                        )}
                        {img.width && img.height && (
                          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-muted-foreground ring-1 ring-inset ring-white/10">
                            {img.width}×{img.height}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Alt:{" "}
                        {img.alt === null ? (
                          <span className="text-rose-300">(none)</span>
                        ) : img.alt === "" ? (
                          <span className="text-amber-300">(empty)</span>
                        ) : (
                          <span className="text-foreground">
                            &ldquo;{img.alt}&rdquo;
                          </span>
                        )}
                      </div>
                      {img.issues.length > 0 ? (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {img.issues.map((iss) => (
                            <span
                              key={iss}
                              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${ISSUE_TONE[iss]}`}
                            >
                              {ISSUE_LABEL[iss]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                          <CheckCircle2 className="size-2.5" />
                          Clean
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "violet" | "emerald" | "rose";
}) {
  const cls = {
    violet: "text-gradient-violet",
    emerald: "text-gradient-emerald",
    rose: "text-gradient-rose",
  }[tone];
  return (
    <div className="glass-apple relative overflow-hidden rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
    </div>
  );
}
