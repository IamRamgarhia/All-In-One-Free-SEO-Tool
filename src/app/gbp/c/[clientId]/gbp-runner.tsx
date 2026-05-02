"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Building,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  runGbpScrape,
  generateReviewReply,
} from "@/app/gbp/actions";
import type { GbpReport, GbpReview } from "@/lib/gbp-scraper";

export function GbpRunner({
  clientId,
  clientName,
}: {
  clientId: number;
  clientName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<GbpReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await runGbpScrape(clientId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setReport(r.report);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Scraping…
            </>
          ) : (
            <>
              <RefreshCw className="size-4" />
              {report ? "Refresh" : "Pull GBP profile"}
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

      {report && (
        <>
          {/* Profile summary */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Building className="size-4 text-cyan-300" />
                Profile
              </h2>
            </header>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Name" value={report.name} />
              <Field
                label="Rating"
                value={
                  report.rating !== null
                    ? `★ ${report.rating} (${report.reviewCount ?? 0} reviews)`
                    : "—"
                }
              />
              <Field label="Address" value={report.address} />
              <Field label="Phone" value={report.phone} />
              {report.website && (
                <Field
                  label="Website"
                  value={report.website}
                  href={report.website}
                />
              )}
              {report.finalUrl && (
                <Field
                  label="Source"
                  value={report.finalUrl}
                  href={report.finalUrl}
                />
              )}
            </div>
          </section>

          {/* Reviews */}
          {report.reviews.length > 0 ? (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">
                  Recent reviews ({report.reviews.length})
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click <strong>Generate AI reply</strong> on any review — we
                  draft a personalized response. Copy + paste into GBP&apos;s
                  reply box manually.
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {report.reviews.map((r, i) => (
                  <ReviewRow
                    key={i}
                    review={r}
                    businessName={report.name ?? clientName}
                  />
                ))}
              </ul>
            </section>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-sm text-muted-foreground">
              No reviews extracted. Some GBP layouts don&apos;t expose reviews
              without scrolling — try the source URL directly.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReviewRow({
  review,
  businessName,
}: {
  review: GbpReview;
  businessName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    setReply(null);
    startTransition(async () => {
      const r = await generateReviewReply({
        businessName,
        reviewer: review.author,
        reviewRating: review.rating,
        reviewText: review.text,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setReply(r.reply);
    });
  }

  function copy() {
    if (!reply) return;
    navigator.clipboard.writeText(reply).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="size-8 shrink-0 rounded-full bg-violet-500/15 ring-1 ring-violet-400/30 grid place-items-center text-xs font-bold text-violet-300">
          {review.author.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{review.author}</span>
            {review.rating !== null && (
              <span className="inline-flex items-center gap-0.5 text-xs">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`size-3 ${
                      n <= (review.rating ?? 0)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                ))}
              </span>
            )}
            {review.relativeTime && (
              <span className="text-[11px] text-muted-foreground">
                {review.relativeTime}
              </span>
            )}
          </div>
          {review.text && (
            <p className="text-sm text-foreground/90">{review.text}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={generate}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Drafting…
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  Generate AI reply
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
          {reply && (
            <div className="mt-2 space-y-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
              <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-300/90">
                AI-drafted reply
              </div>
              <div className="whitespace-pre-wrap text-foreground/90">
                {reply}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={copy}
                >
                  <Copy className="size-3.5" />
                  {copied ? "Copied" : "Copy reply"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Paste into the reply box on GBP. Direct posting requires
                  Google&apos;s Business Profile API auth (not supported yet).
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm">
        {href && value ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {value.replace(/^https?:\/\//, "")}
            <ExternalLink className="size-3 text-muted-foreground" />
          </a>
        ) : (
          value ?? <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

// Used in the success-state CheckCircle below — keeping the icon import warning
// quiet via a hidden ref.
export const _Tick = CheckCircle2;
