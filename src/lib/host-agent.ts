/**
 * The switch for everything that runs programs on the machine hosting this
 * app for a client's code: Claude Code chats and the task queue, and `gh`
 * and `git` for the pull requests.
 *
 * Off unless somebody turns it on, client by client: an install reachable
 * from a network must not hand a signed-in visitor a coding agent on the
 * host. Two levels:
 *
 *   - SEO_TOOL_HOST_AGENT=0 in the environment is a hard off for every
 *     client; nothing in the app can undo it (the one to put in a
 *     Dockerfile or a server's .env);
 *   - otherwise each client has its own switch (clients.code_agent_enabled),
 *     changed by an owner or a manager from the client's settings tab.
 *
 * Ported from the original author's host-agent switch (8fb6972), which was
 * one workspace-wide setting; here it is per client, as asked.
 *
 * The manual path (copy the prompt, download the .md) never needs this:
 * it runs nothing.
 *
 * Synchronous on purpose, like the runner's other database reads.
 */

import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";

export const HOST_AGENT_ENV = "SEO_TOOL_HOST_AGENT";

/** Why Claude Code cannot run for a client. Each has its sentence in messages (clientCode.reasons). */
export type CodeAgentBlock = "env_off" | "client_off" | "no_client";

export type CodeAgentState = { enabled: true } | { enabled: false; reason: CodeAgentBlock };

/** True when the environment forbids the host agent everywhere. */
export function hostAgentForcedOff(): boolean {
  const v = process.env[HOST_AGENT_ENV]?.trim().toLowerCase();
  return v !== undefined && ["0", "false", "no", "off"].includes(v);
}

/** The decision for a client row already in hand. */
export function codeAgentStateFor(client: { codeAgentEnabled: boolean | null } | null | undefined): CodeAgentState {
  if (hostAgentForcedOff()) return { enabled: false, reason: "env_off" };
  if (!client) return { enabled: false, reason: "no_client" };
  if (client.codeAgentEnabled !== true) return { enabled: false, reason: "client_off" };
  return { enabled: true };
}

export function codeAgentState(clientId: number): CodeAgentState {
  if (hostAgentForcedOff()) return { enabled: false, reason: "env_off" };
  try {
    const [row] = db
      .select({ codeAgentEnabled: clients.codeAgentEnabled })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1)
      .all();
    return codeAgentStateFor(row);
  } catch {
    // An unreadable database means "not switched on".
    return { enabled: false, reason: "client_off" };
  }
}

export class CodeAgentOffError extends Error {
  constructor(readonly reason: CodeAgentBlock) {
    super(`code_agent_off:${reason}`);
    this.name = "CodeAgentOffError";
  }
}

/** For code that would spawn a program: throws instead of spawning. */
export function assertCodeAgentEnabled(clientId: number): void {
  const s = codeAgentState(clientId);
  if (!s.enabled) throw new CodeAgentOffError(s.reason);
}

/**
 * Whether a program is installed, found by walking PATH. Nothing is run:
 * asking `claude --version` would already be running a program on the host.
 */
export function findOnPath(cmd: string, envPath = process.env.PATH ?? ""): string | null {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext.toLowerCase());
      try {
        if (!statSync(full).isFile()) continue;
        if (process.platform !== "win32") accessSync(full, constants.X_OK);
        return full;
      } catch {
        // not here
      }
    }
  }
  return null;
}

export type HostTools = { claude: boolean; gh: boolean; git: boolean };

/** Which of the programs the circuit uses are installed on this machine. */
export function hostTools(): HostTools {
  return {
    claude: findOnPath("claude") !== null,
    gh: findOnPath("gh") !== null,
    git: findOnPath("git") !== null,
  };
}
