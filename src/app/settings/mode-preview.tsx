"use client";

import { useState } from "react";
import { Check, ChevronDown, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { type ConnectionMode } from "@/lib/tool-capabilities";
import {
  LISTED_TOOL_COUNT,
  NEEDS_KEY_COUNT,
  WORKS_ANYWAY_COUNT,
  groupByCategory,
  modeCoverage,
  type CoveredTool,
} from "@/lib/connection-coverage";

/**
 * What each way of connecting actually gets you — by name.
 *
 * Exists because the difference is not obvious and guessing it wrong is
 * expensive: a subscription and a key sound interchangeable, and are
 * not. The subscription moves your data into your chat app; the key
 * makes the AI pages in here run. Someone who picks the wrong one finds
 * out when a page they wanted refuses to work.
 *
 * This used to state counts and stop — "the 33 AI tools in this app" —
 * which answers the wrong question twice over. A number cannot tell you
 * whether the tool you came for is in the group, and 33 was not even the
 * right number: it counted the `optional` and `partial` tools, which run
 * without a key, so five working tools were listed as unavailable. The
 * lists and the counts now come from the same derivation, so a number
 * beside a list is that list's length by construction.
 *
 * Every tool name is derived from the generated capability table, never
 * typed out here — an earlier version of this file said "13 tools" while
 * the server exposed 12.
 */

/** A collapsed group of tool names, expanded on click. */
function ToolNameList({
  tools,
  tone,
  openLabel,
}: {
  tools: CoveredTool[];
  tone: "ok" | "no";
  openLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const groups = groupByCategory(tools);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          aria-hidden
        />
        {open ? "Hide the list" : openLabel}
      </button>

      {open && (
        <div className="mt-2 space-y-2 border-l border-border pl-3">
          {groups.map((g) => (
            <div key={g.id}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {g.label}
              </p>
              <ul className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-1">
                {g.tools.map((t) => (
                  <li key={t.href}>
                    {/* Linked, because the next question after "is my
                        tool in this list" is "show me". A tool that
                        needs a key still renders its page; it explains
                        what it needs rather than 404ing. */}
                    <Link
                      href={t.href}
                      className={`inline-block rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset hover:ring-2 ${
                        tone === "ok"
                          ? "bg-emerald-500/[0.07] text-emerald-900 ring-emerald-500/20 dark:text-emerald-100/90"
                          : "bg-white/[0.03] text-muted-foreground ring-white/10"
                      }`}
                    >
                      {t.title}
                      {t.usage === "partial" && (
                        <span
                          title="The main check here runs without a key. One feature on this page needs one."
                          className="ml-1 text-[9px] uppercase tracking-wide opacity-70"
                        >
                          partly
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Row = {
  ok: boolean;
  label: string;
  detail: string;
  /** Rendered under the row, collapsed. */
  tools?: CoveredTool[];
  openLabel?: string;
  /** MCP's tools are a different surface, so they render as plain names. */
  mcpNames?: string[];
};

export function ModePreview({
  mode,
  mcpToolCount,
  mcpToolNames,
}: {
  mode: ConnectionMode;
  mcpToolCount: number;
  mcpToolNames: string[];
}) {
  const { worksAnyway, needsKey } = modeCoverage();

  const keyRow: Row = {
    ok: true,
    label: `All ${LISTED_TOOL_COUNT} tools in this app`,
    detail: `Including the ${NEEDS_KEY_COUNT} that need a model — content briefs, meta rewrites, schema, summaries.`,
    tools: needsKey,
    openLabel: `Show the ${NEEDS_KEY_COUNT} a key unlocks`,
  };

  const freeRow: Row = {
    ok: true,
    label: `The ${WORKS_ANYWAY_COUNT} tools here that need no AI`,
    detail:
      "Audits, rank checks, schema validation, and the rest. These work in every mode, including with nothing connected.",
    tools: worksAnyway,
    openLabel: `Show the ${WORKS_ANYWAY_COUNT}`,
  };

  const missingRow: Row = {
    ok: false,
    label: `The ${NEEDS_KEY_COUNT} tools that call a model directly`,
    detail:
      mode === "mcp"
        ? "A subscription connects the other way round — your chat app calls in — so it cannot drive these. They need an API key or Ollama."
        : "Anything that writes text needs an API key or Ollama.",
    tools: needsKey,
    openLabel: `Show which ${NEEDS_KEY_COUNT}`,
  };

  const rows: Row[] =
    mode === "api" || mode === "both"
      ? [
          keyRow,
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
              detail:
                "A separate surface from the pages in here — these are data and agent operations your chat app can call.",
              mcpNames: mcpToolNames,
            },
            freeRow,
            missingRow,
            {
              ok: false,
              label: "The SEO assistant in this app",
              detail: "Ask your chat app instead; it can see the same data.",
            },
          ]
        : [
            {
              ok: true,
              label: `${WORKS_ANYWAY_COUNT} of the ${LISTED_TOOL_COUNT} tools`,
              detail: "Everything that does not need a model. No setup at all.",
              tools: worksAnyway,
              openLabel: `Show the ${WORKS_ANYWAY_COUNT}`,
            },
            missingRow,
          ];

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-card/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        What this gets you
      </p>
      <ul className="space-y-2">
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
              {r.tools && r.openLabel && (
                <ToolNameList
                  tools={r.tools}
                  tone={r.ok ? "ok" : "no"}
                  openLabel={r.openLabel}
                />
              )}
              {r.mcpNames && <McpNameList names={r.mcpNames} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The MCP tool names, which are deliberately not styled like the app's
 * tools: they are a different surface, called by name inside a chat app
 * rather than visited as pages, and showing them as links would imply
 * routes that do not exist.
 */
function McpNameList({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          aria-hidden
        />
        {open ? "Hide the list" : `Show all ${names.length}`}
      </button>
      {open && (
        <div className="mt-2 border-l border-border pl-3">
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <MessageSquare className="size-2.5" aria-hidden />
            Called by name in your chat app
          </p>
          <ul className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-1">
            {names.map((n) => (
              <li
                key={n}
                className="rounded bg-violet-500/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-violet-900 ring-1 ring-inset ring-violet-500/20 dark:text-violet-100/90"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
