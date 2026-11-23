"use server";

import { isSignedIn, requireSignedIn } from "@/lib/action-guard";

import { requireSettingsAdmin } from "@/lib/auth";
import { randomBytes } from "node:crypto";
import { actionTx } from "@/lib/action-tx";
import { longAgo } from "@/lib/relative-time";
import { revalidatePath } from "next/cache";
import { setSetting, getSetting } from "@/lib/settings-store";
import { configuredProviders, getActiveProvider } from "@/lib/api-keys";
import type { ConnectionMode } from "@/lib/tool-capabilities";

/**
 * What is connected, worked out rather than chosen.
 *
 * This used to return a setting the user picked from three options, and
 * that was wrong twice over. The two are not alternatives — a key and a
 * connected chat app do different jobs and having both is the complete
 * setup — so presenting them as a choice implied picking one ruled out
 * the other. And a stored answer drifts: someone could select "API key",
 * never add one, and every screen would then describe a state that did
 * not exist.
 *
 * Derived from what is actually there, it cannot disagree with reality.
 */
export async function getConnectionMode(): Promise<ConnectionMode> {
  // The root layout and the shell read this on every page, the login
  // page included, so a signed-out caller gets "none" instead of an error.
  if (!(await isSignedIn())) return "none";
  const { getAiAvailability } = await import("@/lib/ai-availability");
  const ai = await getAiAvailability().catch(() => null);
  if (!ai) return "none";
  if (ai.hasKey && ai.hasSubscription) return "both";
  if (ai.hasKey) return "api";
  if (ai.hasSubscription) return "mcp";
  return "none";
}

// =============== Remote MCP ===============

export type McpStatus = {
  /** A token exists, so /api/mcp will answer. */
  enabled: boolean;
  /** The full-access token. Only ever sent to the settings page. */
  token: string | null;
  /** The read-only token, which cannot reach run_agent or apply_fix. */
  readOnlyToken: string | null;
  /** ISO timestamp of the last successful call, if any. */
  lastSeenAt: string | null;
  /** User-agent of the last caller, trimmed. */
  lastClient: string | null;
  /** A client has actually connected — not merely been configured. */
  connected: boolean;
  /**
   * "4 minutes ago", "yesterday" — rendered on the server.
   *
   * Computed here rather than in the browser on purpose: a relative time
   * worked out on the client disagrees with the server's HTML and React
   * errors on the mismatch. Null when nothing has ever connected.
   */
  lastSeenLabel: string | null;
};

/**
 * A client counts as connected for 30 days after its last call.
 *
 * Stateless HTTP means there is no held-open connection to observe, so
 * "connected" can only ever mean "recently talked to us". 30 days is long
 * enough that a working connector used a fortnight ago still reads as
 * connected, and short enough that one removed months ago does not.
 */
const CONNECTED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function getMcpStatus(): Promise<McpStatus> {
  await requireSettingsAdmin();
  await requireSignedIn();
  return readMcpStatus();
}

/** Not an action: the tokens only leave through the guarded getMcpStatus. */
async function readMcpStatus(): Promise<McpStatus> {
  const token = (await getSetting<string>("mcp.access_token")) || null;
  const readOnlyToken = (await getSetting<string>("mcp.readonly_token")) || null;
  const lastSeenAt = (await getSetting<string>("mcp.last_seen_at")) ?? null;
  const lastClient = (await getSetting<string>("mcp.last_client")) ?? null;

  const seenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  const connected =
    Boolean(token || readOnlyToken) &&
    Number.isFinite(seenMs) &&
    Date.now() - seenMs < CONNECTED_WINDOW_MS;

  return {
    enabled: Boolean(token || readOnlyToken),
    token,
    readOnlyToken,
    lastSeenAt,
    lastClient,
    connected,
    // Coarse on purpose: "4 minutes ago" is the answer, not the timestamp.
    lastSeenLabel: Number.isFinite(seenMs)
      ? longAgo(Date.now() - seenMs, await actionTx("time"))
      : null,
  };
}

/**
 * Generates the bearer token for /api/mcp.
 *
 * 32 random bytes, not a hash of anything the user picked — this token is
 * the only thing in front of an endpoint that can read every client and
 * apply changes to live sites.
 */
export async function generateMcpToken(): Promise<{ token: string }> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const token = `seo_mcp_${randomBytes(32).toString("hex")}`;
  await setSetting("mcp.access_token", token);
  revalidatePath("/settings");
  return { token };
}

export async function revokeMcpToken(): Promise<void> {
  await requireSettingsAdmin();
  await requireSignedIn();
  await setSetting("mcp.access_token", "");
  // Deliberately keeps last_seen_at: it is a record of what happened, and
  // clearing it would make a revoked connector look like it never existed.
  revalidatePath("/settings");
}

/**
 * The token to hand a chat app.
 *
 * It reaches only the tools annotated read-only, so a connector holding
 * it can answer questions about every client and change nothing. Prefixed
 * differently so the two are not mistaken for each other at a glance.
 */
export async function generateMcpReadOnlyToken(): Promise<{ token: string }> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const token = `seo_mcp_ro_${randomBytes(32).toString("hex")}`;
  await setSetting("mcp.readonly_token", token);
  revalidatePath("/settings");
  return { token };
}

export async function revokeMcpReadOnlyToken(): Promise<void> {
  await requireSettingsAdmin();
  await requireSignedIn();
  await setSetting("mcp.readonly_token", "");
  revalidatePath("/settings");
}

// =============== Is AI actually connected? ===============

export type AiConnectionStatus = {
  /** Green badge: something is genuinely usable right now. */
  ok: boolean;
  /** Short label for the badge. */
  label: string;
  /** The longer explanation, for a tooltip. */
  detail: string;
};

/**
 * Whether AI is connected, for whichever way the user chose to connect.
 *
 * Both modes get the same green badge when they are genuinely working,
 * because both genuinely drive the same tools. What differs is the
 * evidence: a key is connected when it is configured and selected; a
 * subscription is connected when a chat app has actually called us. The
 * second is a stronger claim than the first, which is the right way
 * round — a pasted key that has never been used still works, whereas an
 * MCP token nobody wired up does nothing at all.
 */
export async function getAiConnectionStatus(): Promise<{
  api: AiConnectionStatus;
  mcp: AiConnectionStatus;
}> {
  // Read on every page, the login page included: a signed-out caller
  // gets "not connected" instead of an error.
  if (!(await isSignedIn())) {
    const off = { ok: false, label: "Not connected", detail: "" };
    return { api: off, mcp: off };
  }
  const { ids } = await configuredProviders();
  const active = await getActiveProvider();
  const mcp = await readMcpStatus();

  const keyCount = ids.length;
  const apiOk = keyCount > 0 && Boolean(active);
  // Labels stay English (connection-mode.tsx maps them to its own keys);
  // the detail, shown as the badge's tooltip, is translated here.
  const t = await actionTx("settings.connection");
  const when = mcp.lastSeenLabel ?? t("recently");

  return {
    api: {
      ok: apiOk,
      label: apiOk ? "Connected" : keyCount > 0 ? "Pick a model" : "Not connected",
      detail: apiOk
        ? t("detail_apiOk", { count: keyCount, model: active ?? "" })
        : keyCount > 0
          ? t("detail_apiPickModel")
          : t("detail_apiNone"),
    },
    mcp: {
      ok: mcp.connected,
      label: mcp.connected
        ? "Connected"
        : mcp.enabled
          ? "Waiting for your chat app"
          : "Not set up",
      detail: mcp.connected
        ? mcp.lastClient
          ? t("lastUsedBy", { when, client: mcp.lastClient })
          : t("lastUsed", { when })
        : mcp.enabled
          ? t("detail_mcpWaiting")
          : t("detail_mcpNotSetUp"),
    },
  };
}
