"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, MessageSquare, Moon } from "lucide-react";
import {
  CONNECTION_MODES,
  AI_TOOL_COUNT,
  FREE_TOOL_COUNT,
  TOTAL_TOOL_COUNT,
  type ConnectionMode,
} from "@/lib/tool-capabilities";
import { setConnectionMode } from "./connection-mode-actions";

const MCP_CONFIG = `{
  "mcpServers": {
    "seo-tool": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp-server.ts"],
      "cwd": "<path to this folder>"
    }
  }
}`;

const ICONS: Record<ConnectionMode, typeof KeyRound> = {
  none: Moon,
  mcp: MessageSquare,
  api: KeyRound,
  both: KeyRound,
};

export function ConnectionModePicker({ initial }: { initial: ConnectionMode }) {
  const [mode, setMode] = useState<ConnectionMode>(initial);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function choose(next: ConnectionMode) {
    setMode(next);
    start(() => {
      void setConnectionMode(next);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">How do you want to connect AI?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {FREE_TOOL_COUNT} of the {TOTAL_TOOL_COUNT} tools need no AI at all and
          already work. This only affects the other {AI_TOOL_COUNT}.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {CONNECTION_MODES.filter((m) => m.id !== "both").map((m) => {
          const Icon = ICONS[m.id];
          const active = mode === m.id || (mode === "both" && m.id !== "none");
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => choose(m.id)}
              disabled={pending}
              aria-pressed={active}
              className={`rounded-xl border p-3 text-left transition ${
                active
                  ? "border-amber-400/50 bg-amber-500/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-3.5 text-amber-300" />
                {m.label}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {m.summary}
              </span>
            </button>
          );
        })}
      </div>

      {/* The one thing a subscription genuinely cannot do. Said plainly here
          rather than discovered later when an overnight report doesn't
          arrive. */}
      {mode === "mcp" && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">
              One thing to know before you rely on this.
            </strong>{" "}
            Your subscription works by your chat app connecting to this tool —
            so it only writes when you&apos;re at the keyboard. Anything that
            runs while you&apos;re away — overnight audits, scheduled reports,
            alerts — still needs an API key. Every tool on the grid works
            either way.
          </p>
          <div>
            <p className="mb-1.5 text-xs font-medium">
              Add this to your Claude Desktop, Claude Code or Cursor config,
              then restart it:
            </p>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed">
              <code>{MCP_CONFIG}</code>
            </pre>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(MCP_CONFIG).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                });
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:border-white/25"
            >
              {copied ? (
                <>
                  <Check className="size-3" /> Copied
                </>
              ) : (
                <>
                  <Copy className="size-3" /> Copy config
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
