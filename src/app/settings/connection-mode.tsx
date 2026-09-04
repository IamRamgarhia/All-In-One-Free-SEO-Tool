"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, MessageSquare } from "lucide-react";
import {
  AI_TOOL_COUNT,
  FREE_TOOL_COUNT,
  TOTAL_TOOL_COUNT,
  type ConnectionMode,
} from "@/lib/tool-capabilities";
import { clientToTab } from "@/lib/mcp-clients";
import type { AiConnectionStatus, McpStatus } from "./connection-mode-actions";
import { generateMcpToken, revokeMcpToken } from "./connection-mode-actions";
import { McpSetup } from "./mcp-setup";
import { ModePreview } from "./mode-preview";

/**
 * Two things you can connect, not three options to pick between.
 *
 * They were a radio group, which said something untrue: that choosing one
 * ruled out the other. They are independent and do different jobs — a key
 * makes the AI pages in this app run, a connected chat app lets Claude or
 * ChatGPT work with your SEO data — and having both is the complete
 * setup. Nothing is selected here now; the state is simply what is
 * connected, so the screen cannot disagree with reality.
 */

function StatusDot({ status }: { status: AiConnectionStatus }) {
  return (
    <span
      title={status.detail}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        status.ok
          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25"
          : "bg-white/[0.04] text-muted-foreground ring-white/10"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          status.ok ? "bg-emerald-400" : "bg-muted-foreground/50"
        }`}
      />
      {status.label}
    </span>
  );
}

function CopyRow({
  label,
  value,
  secret,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [done, setDone] = useState(false);
  const shown =
    secret && value.length > 22
      ? `${value.slice(0, 14)}…${value.slice(-6)}`
      : value;

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <code className="min-w-0 flex-1 truncate rounded border border-border bg-muted px-2 py-1 text-[11px] text-foreground">
        {shown}
      </code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          });
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 text-[11px] hover:border-foreground/25"
      >
        {done ? <Check className="size-3" /> : <Copy className="size-3" />}
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function ConnectionModePicker({
  mode,
  status,
  mcp,
  origin,
  installPath,
  platform,
  nodePath,
  mcpToolCount,
  mcpToolNames,
}: {
  /** Derived from what is connected — see getConnectionMode. */
  mode: ConnectionMode;
  status: { api: AiConnectionStatus; mcp: AiConnectionStatus };
  mcp: McpStatus;
  origin: string;
  installPath: string;
  platform: string;
  nodePath: string;
  mcpToolCount: number;
  mcpToolNames: string[];
}) {
  const [pending, start] = useTransition();
  // Open by default only when there is something left to finish: a token
  // exists but nothing has connected with it yet.
  const [openChat, setOpenChat] = useState(mcp.enabled && !mcp.connected);

  const remoteUrl = `${origin}/api/mcp`;
  const isLocalUrl =
    origin.startsWith("http://") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">AI connection</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {FREE_TOOL_COUNT} of the {TOTAL_TOOL_COUNT} tools need no AI and
          already work. These two cover the other {AI_TOOL_COUNT}. They do
          different jobs — you can have either, or both.
        </p>
      </div>

      {mode === "both" && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] leading-relaxed text-emerald-900 dark:text-emerald-100/90">
          <strong>Both connected — nothing is missing.</strong> The AI tools in
          here run on your key, and your chat app can work with your SEO data
          directly.
        </p>
      )}

      <ModePreview
        mode={mode}
        mcpToolCount={mcpToolCount}
        mcpToolNames={mcpToolNames}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="size-3.5 text-amber-300" />
            <p className="text-sm font-medium">An API key</p>
            <StatusDot status={status.api} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Makes the {AI_TOOL_COUNT} AI tools in this app work — the
            assistant, executive summaries, content writer — and keeps them
            running overnight. Gemini and Groq have free tiers.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Providers are listed below.
          </p>
        </section>

        <section className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <MessageSquare className="size-3.5 text-violet-300" />
            <p className="text-sm font-medium">Your Claude / ChatGPT app</p>
            <StatusDot status={status.mcp} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Lets Claude or ChatGPT read and act on your SEO data through{" "}
            {mcpToolCount} tools, using the subscription you already pay for.
            It works in that app, not in this one.
          </p>
          {mcp.connected && mcp.lastSeenLabel && (
            <p className="text-[11px] text-muted-foreground">
              Last used{" "}
              <span className="text-foreground">{mcp.lastSeenLabel}</span>
              {mcp.lastClient && (
                <>
                  {" "}
                  by <span className="text-foreground">{mcp.lastClient}</span>
                </>
              )}
              .
            </p>
          )}
          <button
            type="button"
            onClick={() => setOpenChat((v) => !v)}
            className="text-[11px] text-violet-300 underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {openChat
              ? "Hide setup"
              : mcp.connected
                ? "Change setup"
                : "Set this up"}
          </button>
        </section>
      </div>

      {openChat && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">How this one works.</strong>{" "}
            Your chat app connects to this tool and calls it, so it answers in
            that app while you&apos;re at the keyboard. It does not power the
            AI pages in here, and nothing is charged per use.
          </p>

          <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
            <p className="text-xs font-medium">Endpoint and token</p>
            {mcp.token ? (
              <>
                <CopyRow label="Server URL" value={remoteUrl} />
                <CopyRow label="Access token" value={mcp.token} secret />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Anyone who can reach that URL with this token can read every
                  client and change live websites — treat it like a password.
                </p>
                {isLocalUrl && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <strong className="text-foreground">
                      This is a local address.
                    </strong>{" "}
                    Right for Claude Code, Claude Desktop and Cursor. claude.ai
                    and ChatGPT cannot reach it — start a tunnel, then open this
                    page on the tunnel address and this row will show the URL to
                    paste.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => start(() => void revokeMcpToken())}
                  className="text-[11px] text-rose-300 underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  Revoke this token
                </button>
              </>
            ) : (
              <>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  The endpoint is closed until you generate a token.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => void generateMcpToken())}
                  className="inline-flex h-8 items-center rounded-lg bg-violet-500/15 px-3 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
                >
                  Generate a token
                </button>
              </>
            )}
          </div>

          <McpSetup
            token={mcp.token}
            origin={origin}
            installPath={installPath}
            platform={platform}
            nodePath={nodePath}
            connectedTab={mcp.connected ? clientToTab(mcp.lastClient) : null}
            connectedClient={mcp.connected ? mcp.lastClient : null}
          />
        </div>
      )}
    </div>
  );
}
