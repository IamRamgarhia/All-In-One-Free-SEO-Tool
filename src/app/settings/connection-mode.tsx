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
import type { AiConnectionStatus } from "./connection-mode-actions";
import { McpSetup } from "./mcp-setup";
import type { McpStatus } from "./connection-mode-actions";
import {
  generateMcpToken,
  revokeMcpToken,
  setConnectionMode,
} from "./connection-mode-actions";

const ICONS: Record<ConnectionMode, typeof KeyRound> = {
  none: Moon,
  mcp: MessageSquare,
  api: KeyRound,
  both: KeyRound,
};

/**
 * Green only when it is genuinely working.
 *
 * "Connected" has to mean the thing actually works, or the badge becomes
 * decoration: a saved key with no model selected, or an MCP token nothing
 * ever called, both look like success and behave like failure.
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

/**
 * A value with a copy button.
 *
 * `secret` masks the middle rather than hiding it entirely: you need to
 * recognise which token this is without reading the whole thing aloud,
 * and copy is what actually moves it.
 */
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
      {/* Theme tokens, not bg-black/40: in light mode that renders as a
          grey slab with pale text and the URL was barely readable. */}
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
        className="inline-flex shrink-0 items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] hover:border-white/25"
      >
        {done ? <Check className="size-3" /> : <Copy className="size-3" />}
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function ConnectionModePicker({
  initial,
  status,
  mcp,
  origin,
  installPath,
  platform,
  nodePath,
}: {
  initial: ConnectionMode;
  status: { api: AiConnectionStatus; mcp: AiConnectionStatus };
  mcp: McpStatus;
  /** Absolute origin, from the server. See remoteUrl below. */
  origin: string;
  /** Where the app is installed, for the stdio config. */
  installPath: string;
  /** process.platform, for OS-specific paths. */
  platform: string;
  /** process.execPath, for a config that needs no PATH lookup. */
  nodePath: string;
}) {
  const [mode, setMode] = useState<ConnectionMode>(initial);
  const [pending, start] = useTransition();

  // The origin is passed in from the server, which reads it off the Host
  // header. Reading window.location here instead produced a hydration
  // mismatch (React #418): the server rendered "/api/mcp" and the browser
  // rendered "http://localhost:63140/api/mcp".
  const remoteUrl = `${origin}/api/mcp`;
  // A local address is one claude.ai and ChatGPT can never reach. Also
  // covers plain http on a LAN IP, which they refuse for the same reason
  // they refuse localhost: it is not HTTPS.
  const isLocalUrl =
    origin.startsWith("http://") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1");

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
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Icon className="size-3.5 text-amber-300" />
                {m.label}
                {/* Shown on both modes, not only the selected one: seeing
                    that a key is live while sitting in MCP mode is the
                    whole point of being able to run both. */}
                {m.id === "api" && <StatusDot status={status.api} />}
                {m.id === "mcp" && <StatusDot status={status.mcp} />}
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
          {/* Remote connectors first: it is what most people mean by
              "connect my ChatGPT / Claude subscription", and it was the
              part that did not exist. */}
          <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
            {/* Titled for what it is, not for one audience.
                It used to read "claude.ai or ChatGPT connector" above a
                localhost URL — the single address those two clients
                cannot use. The value is right for Claude Code, Desktop
                and Cursor; it was the heading that promised otherwise. */}
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium">Endpoint and token</p>
              <StatusDot status={status.mcp} />
            </div>

            {mcp.token ? (
              <>
                <CopyRow label="Server URL" value={remoteUrl} />
                <CopyRow label="Access token" value={mcp.token} secret />
                {/* Per-client instructions live in the tabs below, which
                    fill this token in for you. Only the warning that
                    applies whichever client you pick is repeated here. */}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Anyone who can reach that URL with this token can read every
                  client and change live websites — treat it like a password.
                </p>
                {/* The URL comes from the Host header, so it is whatever
                    address you opened this page on. Open Settings through
                    a tunnel and the row above becomes the tunnel URL by
                    itself — which is exactly what claude.ai needs, and
                    saves anyone assembling it by hand. */}
                {isLocalUrl && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <strong className="text-foreground">
                      This is a local address.
                    </strong>{" "}
                    Right for Claude Code, Claude Desktop and Cursor. claude.ai
                    and ChatGPT cannot reach it — start a tunnel, then open
                    this page on the tunnel address and this row will show the
                    URL to paste. Steps are in the claude.ai / ChatGPT tab
                    below.
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
          />
        </div>
      )}
    </div>
  );
}
