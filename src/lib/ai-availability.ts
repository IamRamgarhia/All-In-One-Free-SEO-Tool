import { configuredProviders } from "./api-keys";
import { getSetting } from "./settings-store";

/**
 * Is AI usable at all, by any route?
 *
 * One definition, because there are two ways to have AI and code that
 * knew about only one of them was already wrong: the "Connect an AI
 * provider" prompt tested for API keys alone, so it kept nagging
 * somebody whose Claude subscription was connected and working. Being
 * told to set up a thing you have already set up reads as the app being
 * broken.
 */
export type AiAvailability = {
  /**
   * Can THIS APP call a model?
   *
   * Only a key or Ollama does that. A connected chat subscription does
   * not: MCP runs the other way, with the chat app calling into this
   * one, so the AI pages here still have nothing to call. Treating the
   * two as interchangeable is what made the SEO assistant report "No
   * active AI provider" on a screen that claimed AI was connected.
   */
  available: boolean;
  /** A provider key is saved. */
  hasKey: boolean;
  /** A chat app has connected over MCP recently. Not the same thing. */
  hasSubscription: boolean;
  /** What connected, in its own words — e.g. "claude-ai 0.1.0". */
  client: string | null;
};

/** Matches the window used by the Settings badge. */
const CONNECTED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function getAiAvailability(): Promise<AiAvailability> {
  const { ids } = await configuredProviders().catch(() => ({
    ids: [] as string[],
    byId: {} as Record<string, string>,
  }));

  const lastSeen = await getSetting<string>("mcp.last_seen_at").catch(() => null);
  const client = (await getSetting<string>("mcp.last_client").catch(() => null)) ?? null;

  const seenMs = lastSeen ? Date.parse(lastSeen) : NaN;
  const hasSubscription =
    Number.isFinite(seenMs) && Date.now() - seenMs < CONNECTED_WINDOW_MS;

  return {
    // Keys only. See the note on `available` above.
    available: ids.length > 0,
    hasKey: ids.length > 0,
    hasSubscription,
    client: hasSubscription ? client : null,
  };
}

export { clientToTab } from "./mcp-clients";
