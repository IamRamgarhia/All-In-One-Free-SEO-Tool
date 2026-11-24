"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, MessageSquare } from "lucide-react";
import type { ConnectionMode } from "@/lib/tool-capabilities";
// Not AI_TOOL_COUNT: that counts every page that can reach a model,
// including the ones that run without a key, so it over-stated what a
// key unlocks. These are the lengths of the lists ConnectionTools names.
import { connectionCoverage } from "@/lib/connection-coverage";
import { ConnectionTools } from "@/components/connection-tools";
import { clientToTab } from "@/lib/mcp-clients";
import type { AiConnectionStatus, McpStatus } from "./connection-mode-actions";
import {
  generateMcpReadOnlyToken,
  generateMcpToken,
  revokeMcpReadOnlyToken,
  revokeMcpToken,
} from "./connection-mode-actions";
import { McpSetup } from "./mcp-setup";
import { GskSheet } from "./gsk-sheet";

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

// getAiConnectionStatus returns English labels; shown translated here.
const STATUS_KEYS: Record<string, string> = {
  Connected: "status_connected",
  "Pick a model": "status_pickModel",
  "Not connected": "status_notConnected",
  "Waiting for your chat app": "status_waiting",
  "Not set up": "status_notSetUp",
};

function StatusTag({ status }: { status: AiConnectionStatus }) {
  const t = useTranslations("settings.connection");
  const key = STATUS_KEYS[status.label];
  return (
    <span
      title={status.detail}
      className={status.ok ? "gsk-tag gsk-tag--success" : "gsk-tag gsk-tag--default"}
    >
      {key ? t(key) : status.label}
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
  const t = useTranslations("settings.connection");
  const [done, setDone] = useState(false);
  const shown =
    secret && value.length > 22 ? `${value.slice(0, 14)}…${value.slice(-6)}` : value;

  return (
    <div>
      <span className="gsk-field-label">{label}</span>
      <div className="flex gap-2">
        <input readOnly value={shown} className="gsk-input gsk-mono" aria-label={label} />
        <button
          type="button"
          className="gsk-btn"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1800);
            });
          }}
        >
          {done ? <Check className="size-4" /> : <Copy className="size-4" />}
          {done ? t("copied") : t("copy")}
        </button>
      </div>
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
  // Listed by the old "what this gets you" box; kept for callers.
  mcpToolNames: _mcpToolNames,
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
  const [openChat, setOpenChat] = useState(false);

  const remoteUrl = `${origin}/api/mcp`;
  const isLocalUrl =
    origin.startsWith("http://") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1");

  const t = useTranslations("settings.connection");
  const cov = connectionCoverage();
  const needsKey = cov.needsKey.length;

  return (
    <section className="gsk-block">
      <div className="gsk-block-head">
        <h2 className="gsk-block-title">{t("title")}</h2>
        <p className="gsk-block-description">
          {t("intro", { free: cov.total - needsKey, total: cov.total, ai: needsKey })}
        </p>
      </div>

      <div className="gsk-card-grid">
        <div className={status.api.ok ? "gsk-card gsk-card--on items-start" : "gsk-card items-start"}>
          <span className="gsk-card__badge" aria-hidden>
            <KeyRound className="size-4" />
          </span>
          <div className="gsk-card__body">
            <div className="gsk-card__header">
              <span className="gsk-card__title">{t("apiTitle")}</span>
              <StatusTag status={status.api} />
            </div>
            <p className="gsk-card__subtitle">{t("apiBody", { ai: needsKey })}</p>
          </div>
        </div>

        <div className={status.mcp.ok ? "gsk-card gsk-card--on items-start" : "gsk-card items-start"}>
          <span className="gsk-card__badge" aria-hidden>
            <MessageSquare className="size-4" />
          </span>
          <div className="gsk-card__body">
            <div className="gsk-card__header">
              <span className="gsk-card__title">{t("chatTitle")}</span>
              <StatusTag status={status.mcp} />
            </div>
            <p className="gsk-card__subtitle">{t("chatBody", { count: mcpToolCount })}</p>
            {mcp.connected && mcp.lastSeenLabel ? (
              <p className="gsk-card__subtitle">
                {mcp.lastClient
                  ? t("lastUsedBy", { when: mcp.lastSeenLabel, client: mcp.lastClient })
                  : t("lastUsed", { when: mcp.lastSeenLabel })}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setOpenChat(true)}
              className="gsk-btn gsk-btn--sm mt-2"
            >
              {mcp.connected ? t("changeSetup") : mcp.enabled ? t("finishSetup") : t("setUp")}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <ConnectionTools kind="ai" summary={false} />
      </div>

      {mode === "both" ? <p className="gsk-help gsk-status-ok">{t("both")}</p> : null}

      {openChat ? (
        <GskSheet
          title={t("chatTitle")}
          subtitle={t("sheetSubtitle")}
          icon={<MessageSquare className="size-4" />}
          closeLabel={t("close")}
          onClose={() => setOpenChat(false)}
        >
        <div className="gsk-drawer__body">
          <p className="m-0 text-[13px] leading-relaxed text-[var(--gsk-text-2)]">{t("howItWorks")}</p>

          <div className="space-y-3">
            <h4 className="gsk-section-title">{t("endpointTitle")}</h4>
            {mcp.enabled ? <CopyRow label={t("serverUrl")} value={remoteUrl} /> : null}

            {/* The read-only token first: it is the one almost everyone
                should be pasting into a chat app. */}
            {mcp.readOnlyToken ? (
              <>
                <CopyRow label={t("readOnlyToken")} value={mcp.readOnlyToken} secret />
                <p className="gsk-help">{t("readOnlyHint")}</p>
                <button
                  type="button"
                  className="gsk-btn gsk-btn--danger-text"
                  onClick={() => start(() => void revokeMcpReadOnlyToken())}
                >
                  {t("revokeReadOnly")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="gsk-btn gsk-btn--primary"
                disabled={pending}
                onClick={() => start(() => void generateMcpReadOnlyToken())}
              >
                {t("generateReadOnly")}
              </button>
            )}

            {mcp.token ? (
              <>
                <CopyRow label={t("fullToken")} value={mcp.token} secret />
                <p className="gsk-help">{t("fullTokenHint")}</p>
                {isLocalUrl ? <p className="gsk-help">{t("localAddress")}</p> : null}
                <button
                  type="button"
                  className="gsk-btn gsk-btn--danger-text"
                  onClick={() => start(() => void revokeMcpToken())}
                >
                  {t("revokeFull")}
                </button>
              </>
            ) : (
              <>
                <p className="gsk-help">{t("fullTokenWhy")}</p>
                <button
                  type="button"
                  className="gsk-btn"
                  disabled={pending}
                  onClick={() => start(() => void generateMcpToken())}
                >
                  {t("generateFull")}
                </button>
              </>
            )}
            {!mcp.enabled ? <p className="gsk-help">{t("closedUntil")}</p> : null}
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
        <footer className="gsk-drawer__footer">
          <span />
          <button type="button" className="gsk-btn gsk-btn--primary" onClick={() => setOpenChat(false)}>
            {t("done")}
          </button>
        </footer>
        </GskSheet>
      ) : null}
    </section>
  );
}
