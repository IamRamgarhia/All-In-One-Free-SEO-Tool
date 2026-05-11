"use client";

/**
 * Renders one error log row with the friendlyError translation: the
 * raw message becomes a plain-English title + cause + numbered fix
 * steps, plus a pre-filled "Report on GitHub" link when applicable.
 *
 * The raw stack trace is tucked behind a disclosure for debugging,
 * not in the user's face.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Bug,
} from "lucide-react";
import { friendlyError, ghIssueLink } from "@/lib/friendly-error";

type ErrorRow = {
  id: number;
  source: "server" | "client" | "worker";
  context: string;
  message: string;
  stack: string | null;
  url: string | null;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolved: boolean;
};

export function ErrorRow({ error: e }: { error: ErrorRow }) {
  const fe = useMemo(
    () => friendlyError(e.message, e.context, e.stack ?? undefined),
    [e],
  );
  const issueUrl = useMemo(() => ghIssueLink(fe), [fe]);
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  async function copyForIssue() {
    const text = [
      `Error: ${e.message}`,
      `Context: ${e.context}`,
      `Source: ${e.source}`,
      e.url ? `URL: ${e.url}` : "",
      `First seen: ${e.firstSeenAt.toISOString()}`,
      `Last seen: ${e.lastSeenAt.toISOString()}`,
      `Occurrences: ${e.occurrences}`,
      "",
      "Stack:",
      e.stack ?? "(no stack)",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">
      {/* Plain-English title */}
      <h3 className="flex items-start gap-2 text-[14px] font-medium text-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-300" />
        <span className="break-words">{fe.title}</span>
      </h3>

      {/* What's happening — plain explanation */}
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {fe.explanation}
      </p>

      {/* Numbered fix steps */}
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <CheckCircle2 className="size-3 text-emerald-300" />
          Try this
        </h4>
        <ol className="mt-2 space-y-1.5 text-[13px] text-foreground">
          {fe.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Contextual help link */}
      {fe.helpLink && (
        <Link
          href={fe.helpLink.href}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-violet-300 hover:underline"
        >
          {fe.helpLink.label}
          <ExternalLink className="size-3" />
        </Link>
      )}

      {/* GitHub issue prefill + copy */}
      {issueUrl && (
        <div className="flex flex-wrap gap-2">
          <a
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1 text-[12px] text-foreground hover:bg-accent"
          >
            <Bug className="size-3.5" />
            Report on GitHub
            <ExternalLink className="size-3 opacity-70" />
          </a>
          <button
            type="button"
            onClick={copyForIssue}
            className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Copy className="size-3.5" />
            {copied ? "Copied" : "Copy details"}
          </button>
        </div>
      )}

      {/* Raw error / URL / stack tucked behind a disclosure */}
      {(e.url || e.stack) && (
        <details
          open={showRaw}
          onToggle={(ev) => setShowRaw((ev.target as HTMLDetailsElement).open)}
          className="rounded-md border border-border bg-muted/10"
        >
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight
              className={`size-3 transition-transform ${showRaw ? "rotate-90" : ""}`}
            />
            Raw error details
          </summary>
          {showRaw && (
            <div className="space-y-2 border-t border-border px-3 py-2">
              <p className="font-mono text-[11px] text-foreground/90">
                {e.message}
              </p>
              {e.url && (
                <p className="text-[11px] text-muted-foreground">
                  <span className="text-muted-foreground/80">URL:</span>{" "}
                  <code className="font-mono">{e.url}</code>
                </p>
              )}
              {e.stack && (
                <pre className="max-h-64 overflow-auto rounded-md bg-background/50 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {e.stack}
                </pre>
              )}
            </div>
          )}
        </details>
      )}
    </div>
  );
}
