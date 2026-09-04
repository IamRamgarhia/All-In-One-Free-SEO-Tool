"use client";

import { Check, X } from "lucide-react";
import {
  AI_TOOL_COUNT,
  FREE_TOOL_COUNT,
  TOTAL_TOOL_COUNT,
  type ConnectionMode,
} from "@/lib/tool-capabilities";

/**
 * What each way of connecting actually gets you.
 *
 * Exists because the difference is not obvious and guessing it wrong is
 * expensive: a subscription and a key sound interchangeable, and are
 * not. The subscription moves your data into your chat app; the key
 * makes the AI pages in here run. Someone who picks the wrong one finds
 * out when a page they wanted refuses to work.
 *
 * Every number is passed in or imported, never typed out — the earlier
 * copy said "13 tools" when the server exposed 12.
 */
export function ModePreview({
  mode,
  mcpToolCount,
  mcpToolNames,
}: {
  mode: ConnectionMode;
  mcpToolCount: number;
  mcpToolNames: string[];
}) {
  const rows: { ok: boolean; label: string; detail: string }[] =
    mode === "api" || mode === "both"
      ? [
          {
            ok: true,
            label: `All ${TOTAL_TOOL_COUNT} tools in this app`,
            detail: `Including the ${AI_TOOL_COUNT} that write text — content briefs, meta rewrites, schema, summaries.`,
          },
          {
            ok: true,
            label: "The SEO assistant and executive summaries",
            detail: "Anything in here that calls a model.",
          },
          {
            ok: true,
            label: "Work that runs while you're away",
            detail: "Overnight audits, scheduled reports, alerts.",
          },
        ]
      : mode === "mcp"
        ? [
            {
              ok: true,
              label: `${mcpToolCount} tools inside Claude or ChatGPT`,
              detail: mcpToolNames.join(", "),
            },
            {
              ok: true,
              label: `The ${FREE_TOOL_COUNT} tools here that need no AI`,
              detail: "Audits, rank checks, schema validation, and the rest.",
            },
            {
              ok: false,
              label: `The ${AI_TOOL_COUNT} AI tools in this app`,
              detail:
                "These call a model directly. A subscription connects the other way — your chat app calls in — so it cannot drive them.",
            },
            {
              ok: false,
              label: "The SEO assistant in this app",
              detail: "Ask your chat app instead; it can see the same data.",
            },
          ]
        : [
            {
              ok: true,
              label: `${FREE_TOOL_COUNT} of the ${TOTAL_TOOL_COUNT} tools`,
              detail: "Everything that does not need a model. No setup at all.",
            },
            {
              ok: false,
              label: `The other ${AI_TOOL_COUNT}`,
              detail: "Anything that writes text needs a key or Ollama.",
            },
          ];

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-card/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        What this gets you
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex gap-2">
            {r.ok ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            ) : (
              <X className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-medium ${r.ok ? "" : "text-muted-foreground"}`}
              >
                {r.label}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {r.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
