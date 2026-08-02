"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  ScanText,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import { parseScreenshot } from "./actions";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import { RecentRuns } from "@/components/recent-runs";

const MAX_BYTES = 4 * 1024 * 1024;

const PARSE_TYPES = [
  {
    id: "rank_table",
    label: "Rank tracker / SERP table",
    hint: "Keyword, position, volume, change",
  },
  {
    id: "audit_issues",
    label: "Audit issues list",
    hint: "From Ahrefs / Semrush / Screaming Frog",
  },
  {
    id: "backlink_table",
    label: "Backlink list",
    hint: "Source domain, anchor, target",
  },
  {
    id: "metric_panel",
    label: "Metric / KPI panel",
    hint: "Traffic, conversions, MRR — with current/previous values",
  },
  {
    id: "content_brief",
    label: "Content brief / outline",
    hint: "Headings + supporting points",
  },
  {
    id: "general",
    label: "General — extract any structured table",
    hint: "Best-effort fallback",
  },
];

export default function ScreenshotImportPage() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [parseType, setParseType] = useState("metric_panel");
  const [pending, startTransition] = useTransition();
  const [parsed, setParsed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refreshKey = useRunRefreshKey(parsed ?? null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.type)) {
      setError("Image must be PNG / JPEG / GIF / WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image too large (>4MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
    setError(null);
  }

  function clear() {
    setImageDataUrl(null);
    setParsed(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function run() {
    if (!imageDataUrl) {
      setError("Pick a screenshot first.");
      return;
    }
    setError(null);
    setParsed(null);
    startTransition(async () => {
      const r = await parseScreenshot({ imageDataUrl, parseType });
      if (r.ok) setParsed(r.text);
      else setError(r.error);
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All tools
      </Link>

      <PageHeader
        title="Screenshot import — parse paid-tool data"
        description="Drag a screenshot from Ahrefs, Semrush, GSC, GA4, or any internal dashboard. AI vision extracts the structured data so you can copy it into the tool and stop paying for tools you only use occasionally."
        icon={ScanText}
        accent="violet"
      />

      <section className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PARSE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setParseType(t.id)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                parseType === t.id
                  ? "border-violet-500/40 bg-violet-500/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-[11px] text-muted-foreground">{t.hint}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={onFile}
            className="hidden"
            id="screenshot-file"
          />
          <label
            htmlFor="screenshot-file"
            className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md bg-white/5 px-3 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
          >
            <ImagePlus className="size-3.5" />
            Pick screenshot
          </label>
          {imageDataUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageDataUrl}
                alt="upload"
                className="h-12 rounded ring-1 ring-inset ring-white/10"
              />
              <button
                type="button"
                onClick={clear}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300"
                aria-label="Remove image"
              >
                <X className="size-3" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={run}
            disabled={pending || !imageDataUrl}
            className="ml-auto inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-1 size-3 animate-spin" />
                Extracting…
              </>
            ) : (
              <>
                <ScanText className="mr-1 size-3" />
                Extract data
              </>
            )}
          </button>
        </div>
        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
            {error}
          </p>
        )}
      </section>

      {parsed && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">Extracted data</h2>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(parsed)}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-3 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
            >
              Copy
            </button>
          </header>
          <pre className="overflow-x-auto whitespace-pre-wrap p-5 font-mono text-[12px] leading-relaxed">
            {parsed}
          </pre>
          <div className="border-t border-white/[0.05] px-5 py-3">
            <AiDisclaimer variant="inline" />
          </div>
        </section>
      )}
      <RecentRuns toolId="screenshot-import" refreshKey={refreshKey} />
    </div>
  );
}
