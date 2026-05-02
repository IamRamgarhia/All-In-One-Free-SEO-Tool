import { ScanText } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ScreenshotImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Import from screenshot"
        description="Upload a screenshot of any SEO dashboard (Search Console, Analytics, Ahrefs, Semrush, paid client reports) — we'll OCR the text and extract structured data."
        icon={ScanText}
        accent="fuchsia"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-white/10">
            Tesseract.js · runs locally
          </span>
        }
      />

      <ScreenshotImportForm />

      <div className="grid gap-3 sm:grid-cols-3 text-xs">
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          <div className="font-semibold text-foreground">Why this exists</div>
          <p className="mt-1 text-muted-foreground">
            Some data lives behind paid tools you don&apos;t want to keep
            paying for. OCR + LLM lets you snapshot it once and bring it in.
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          <div className="font-semibold text-foreground">How it works</div>
          <p className="mt-1 text-muted-foreground">
            Tesseract.js does the OCR locally. If you have an OpenAI / Anthropic
            key set, an LLM also extracts structured fields — metrics, queries,
            dates, source.
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          <div className="font-semibold text-foreground">What works best</div>
          <p className="mt-1 text-muted-foreground">
            High-resolution screenshots with clear text. Avoid heavy
            backgrounds. PNG &gt; JPEG for crisp text.
          </p>
        </div>
      </div>
    </div>
  );
}
