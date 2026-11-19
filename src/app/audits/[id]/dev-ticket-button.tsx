"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Download } from "lucide-react";

/**
 * "Give my developer instructions" — the button CLAUDE.md Part 3.5
 * promised and that was never built.
 *
 * The audit page lists what is wrong. For the 42 finding types the agent
 * cannot fix itself, that list is where the user's journey ended: they
 * had to translate severity labels and crawler messages into something
 * a developer could act on, by hand, every month.
 *
 * The content is assembled server-side from the same explainers the
 * issue cards render, so the ticket and the page cannot disagree. This
 * component only moves it to the clipboard or to a file — deliberately
 * both, because a 40-page site produces a ticket far longer than anyone
 * wants pasted into a chat window.
 */
export function DevTicketButton({
  markdown,
  filename,
  findingCount,
}: {
  markdown: string;
  filename: string;
  findingCount: number;
}) {
  const [copied, setCopied] = useState(false);

  if (findingCount === 0) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure context, permissions).
      // Falling back to the download keeps the button honest rather than
      // showing a tick for something that did not happen.
      download();
    }
  }

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-400" />
        ) : (
          <ClipboardCopy className="size-3.5" />
        )}
        {copied ? "Copied" : "Copy developer instructions"}
      </button>
      <button
        type="button"
        onClick={download}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
        title="Markdown — pastes into GitHub, Linear, Jira, Slack or email"
      >
        <Download className="size-3.5" />
        Download .md
      </button>
      <span className="text-[11px] text-muted-foreground">
        {findingCount} finding{findingCount === 1 ? "" : "s"}, grouped by type
        with steps and code
      </span>
    </div>
  );
}
