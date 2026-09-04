"use server";

import { randomBytes } from "node:crypto";
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
  /** The token itself. Only ever sent to the settings page. */
  token: string | null;
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

/** Coarse on purpose — "4 minutes ago" is the answer, not the timestamp. */
function relativeTime(iso: string): string {
  const secs = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

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
  const token = (await getSetting<string>("mcp.access_token")) ?? null;
  const lastSeenAt = (await getSetting<string>("mcp.last_seen_at")) ?? null;
  const lastClient = (await getSetting<string>("mcp.last_client")) ?? null;

  const seenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  const connected =
    Boolean(token) &&
    Number.isFinite(seenMs) &&
    Date.now() - seenMs < CONNECTED_WINDOW_MS;

  return {
    enabled: Boolean(token),
    token,
    lastSeenAt,
    lastClient,
    connected,
    lastSeenLabel: Number.isFinite(seenMs) ? relativeTime(lastSeenAt!) : null,
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
  const token = `seo_mcp_${randomBytes(32).toString("hex")}`;
  await setSetting("mcp.access_token", token);
  revalidatePath("/settings");
  return { token };
}

export async function revokeMcpToken(): Promise<void> {
  await setSetting("mcp.access_token", "");
  // Deliberately keeps last_seen_at: it is a record of what happened, and
  // clearing it would make a revoked connector look like it never existed.
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
  const { ids } = await configuredProviders();
  const active = await getActiveProvider();
  const mcp = await getMcpStatus();

  const keyCount = ids.length;
  const apiOk = keyCount > 0 && Boolean(active);

  return {
    api: {
      ok: apiOk,
      label: apiOk ? "Connected" : keyCount > 0 ? "Pick a model" : "Not connected",
      detail: apiOk
        ? `${keyCount} provider${keyCount === 1 ? "" : "s"} configured, using ${active}.`
        : keyCount > 0
          ? "Keys are saved but no active model is selected, so AI features have nothing to call."
          : "No provider key saved yet.",
    },
    mcp: {
      ok: mcp.connected,
      label: mcp.connected
        ? "Connected"
        : mcp.enabled
          ? "Waiting for your chat app"
          : "Not set up",
      detail: mcp.connected
        ? `Last used ${mcp.lastSeenAt ? new Date(mcp.lastSeenAt).toLocaleString() : "recently"}${
            mcp.lastClient ? ` by ${mcp.lastClient}` : ""
          }.`
        : mcp.enabled
          ? "Token generated, but nothing has connected yet. Add the config to your chat app and restart it."
          : "Generate a token to let your Claude or ChatGPT subscription connect.",
    },
  };
}
