"use client";

import { useActionState, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  ScanText,
  Upload,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  extractScreenshotText,
  type OcrResult,
} from "./actions";

export function ScreenshotImportForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<
    OcrResult | null,
    FormData
  >(extractScreenshotText, null);

  const handleFile = (file: File) => {
    setFileError(null);
    if (file.size > 8 * 1024 * 1024) {
      setFileError("Image too large (max 8 MB).");
      return;
    }
    if (!/^image\/(png|jpeg|webp|bmp|tiff)$/i.test(file.type)) {
      setFileError("Use PNG, JPEG, WebP, BMP, or TIFF.");
      return;
    }
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) handleFile(file);
        e.preventDefault();
        return;
      }
    }
  };

  return (
    <div className="space-y-6" onPaste={handlePaste}>
      {/* Upload card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-fuchsia-500/15 blur-3xl" />
        {imageDataUrl ? (
          <div className="relative space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {filename}
              </span>
              <button
                type="button"
                onClick={() => {
                  setImageDataUrl(null);
                  setFilename(null);
                }}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageDataUrl}
                alt="Uploaded screenshot"
                className="max-h-96 w-full object-contain"
              />
            </div>
            <form action={formAction}>
              <input
                type="hidden"
                name="imageDataUrl"
                value={imageDataUrl}
              />
              <Button
                type="submit"
                disabled={pending}
                className="shadow-md shadow-fuchsia-500/20"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Reading text…
                  </>
                ) : (
                  <>
                    <ScanText className="size-4" />
                    Extract data
                  </>
                )}
              </Button>
            </form>
          </div>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-6 py-10 text-sm text-muted-foreground hover:border-white/25 hover:bg-white/5 hover:text-foreground"
            >
              <Upload className="size-6" />
              <span className="font-medium">
                Click to upload a screenshot
              </span>
              <span className="text-xs">
                Or paste from clipboard (Ctrl+V) anywhere on this page
              </span>
              <span className="text-[10px]">
                PNG · JPEG · WebP · BMP · TIFF · max 8 MB
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            {fileError && (
              <p className="mt-3 text-xs text-rose-300">{fileError}</p>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {state && state.ok && <Results result={state} />}
      {state && !state.ok && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </div>
      )}
    </div>
  );
}

function Results({ result }: { result: Extract<OcrResult, { ok: true }> }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  const m = result.structured.metrics ?? [];
  const q = result.structured.queries ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-300">
        <CheckCircle2 className="size-4" />
        Text extracted · structured by{" "}
        <span className="font-semibold">{result.provider}</span>
      </div>

      {(m.length > 0 || q.length > 0 || result.structured.date) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {m.length > 0 && (
            <section className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
              <header className="border-b border-white/5 px-5 py-3 text-sm font-semibold">
                Metrics found ({m.length})
              </header>
              <ul className="divide-y divide-white/5">
                {m.map((row, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                  >
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-mono">
                      {row.value}
                      {row.previous && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (was {row.previous})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {q.length > 0 && (
            <section className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
              <header className="border-b border-white/5 px-5 py-3 text-sm font-semibold">
                Queries found ({q.length})
              </header>
              <ul className="divide-y divide-white/5">
                {q.map((row, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                  >
                    <span className="font-mono text-xs">{row.query}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.position && `pos ${row.position}`}
                      {row.position && row.clicks ? " · " : ""}
                      {row.clicks && `${row.clicks} clicks`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {(result.structured.date || result.structured.source) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {result.structured.date && (
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground ring-1 ring-inset ring-white/10">
              Date: {result.structured.date}
            </span>
          )}
          {result.structured.source && (
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground ring-1 ring-inset ring-white/10">
              Source: {result.structured.source}
            </span>
          )}
        </div>
      )}

      {/* Raw text */}
      <section className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-3 text-sm font-semibold">
          Raw extracted text
          <button
            type="button"
            onClick={handleCopy}
            className={
              copied
                ? "inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
                : "inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-foreground/80 ring-1 ring-inset ring-white/10 hover:bg-white/10"
            }
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </header>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed text-foreground/85">
          {result.text}
        </pre>
      </section>

      {result.structured.notes && (
        <p className="text-xs italic text-muted-foreground">
          <ImageIcon className="mr-1 inline size-3" />
          {result.structured.notes}
        </p>
      )}
    </div>
  );
}
