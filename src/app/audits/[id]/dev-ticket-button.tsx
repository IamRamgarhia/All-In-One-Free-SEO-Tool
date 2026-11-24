"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ClipboardCopy, Download } from "lucide-react";

/**
 * "Copy developer instructions" (ported from upstream a33a8b7).
 *
 * The audit page lists what is wrong; for anyone who does not fix their
 * own code, that list is where the journey ended. The ticket is
 * assembled server-side from the same guides the issue cards show, so
 * the ticket and the page cannot disagree; this only moves it to the
 * clipboard or to a file — both, because a ticket for a large site is
 * longer than anyone wants pasted into a chat window.
 */
export function DevTicketButton({
  markdown,
  filename,
  findingCount,
  typeCount,
}: {
  markdown: string;
  filename: string;
  findingCount: number;
  typeCount: number;
}) {
  const t = useTranslations("auditUi.devTicket");
  const [copied, setCopied] = useState(false);

  if (findingCount === 0) return null;

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (insecure context, permissions): the download
      // keeps the button honest rather than showing a tick for nothing.
      download();
    }
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-white/10";

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <button type="button" onClick={copy} className={btn} aria-live="polite">
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <ClipboardCopy className="size-3.5" />}
        {copied ? t("copied") : t("copy")}
      </button>
      <button type="button" onClick={download} className={btn} title={t("downloadTitle")}>
        <Download className="size-3.5" />
        {t("download")}
      </button>
      <span className="text-[11px] text-muted-foreground">
        {t("count", { findings: findingCount, types: typeCount })}
      </span>
    </div>
  );
}
