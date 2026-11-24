/**
 * What the pages show about a client's code circuit, decided on the
 * server: the page only words it (clientCode.*), it recodes nothing.
 */

import { codeAgentStateFor, hostTools, type CodeAgentBlock, type HostTools } from "@/lib/host-agent";

export type ClientCodeView = {
  /** Claude Code may run for this client right now (switch on, installed, folder set). */
  canRun: boolean;
  /** Why not, most important first; null when it can. */
  blocker: CodeAgentBlock | "claude_missing" | "no_folder" | null;
  enabled: boolean;
  forcedOff: boolean;
  tools: HostTools;
  hasFolder: boolean;
  hasRepo: boolean;
  prMode: "off" | "pr" | "pr_batch";
};

export function clientCodeView(client: {
  codeAgentEnabled: boolean | null;
  localPath: string | null;
  githubRepo: string | null;
  prMode: "off" | "pr" | "pr_batch" | null;
}): ClientCodeView {
  const state = codeAgentStateFor(client);
  const tools = hostTools();
  const hasFolder = Boolean(client.localPath?.trim());
  const blocker = !state.enabled
    ? state.reason
    : !tools.claude
      ? "claude_missing"
      : !hasFolder
        ? "no_folder"
        : null;
  return {
    canRun: blocker === null,
    blocker,
    enabled: state.enabled,
    forcedOff: !state.enabled && state.reason === "env_off",
    tools,
    hasFolder,
    hasRepo: Boolean(client.githubRepo),
    prMode: client.prMode ?? "off",
  };
}
