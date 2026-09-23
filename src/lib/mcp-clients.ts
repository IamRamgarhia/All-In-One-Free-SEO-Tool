/**
 * Mapping MCP client names to the setup tab they belong to.
 *
 * Deliberately its own module with no imports. It lives apart from
 * ai-availability.ts because that one reaches the database, and a client
 * component importing this pure helper from there pulled better-sqlite3
 * into the browser bundle and failed the build. A pure function used by
 * both sides has to sit somewhere that imports nothing.
 */

export type McpClientTab = "claude-code" | "claude-desktop" | "cursor" | "web";

/**
 * Which setup tab a connected client corresponds to.
 *
 * Clients name themselves during the MCP handshake, and those names are
 * not the names on the tabs: Claude Desktop calls itself "claude-ai",
 * Claude Code calls itself "claude-code". Mapping them is what lets the
 * UI point at the one that is actually working rather than showing four
 * identical tabs.
 *
 * Returns null for a name we do not recognise, which is the honest
 * answer for a client nobody has seen before.
 */
export function clientToTab(client: string | null): McpClientTab | null {
  if (!client) return null;
  const c = client.toLowerCase();

  // Checked before "claude-ai": "claude-code" also contains "claude",
  // and a looser test for Desktop would swallow it.
  if (c.includes("claude-code") || c.includes("claude code")) return "claude-code";
  if (c.includes("cursor")) return "cursor";
  if (c.includes("claude-ai") || c.includes("claude desktop")) return "claude-desktop";
  return null;
}
