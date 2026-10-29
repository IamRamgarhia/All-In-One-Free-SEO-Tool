/**
 * The one switch for everything that runs programs on the machine hosting
 * this app: Claude Code chats and autopilot, `gh` and `git` for the task
 * pull requests, the native folder picker, and "open in Claude".
 *
 * It is OFF unless somebody turns it on, so an install reachable from a
 * network (a VPS behind one optional password) does not hand a signed-in
 * visitor a coding agent on the host. Two ways to turn it on:
 *
 *   - Settings → Claude Code on this computer (stored as a workspace setting)
 *   - SEO_TOOL_HOST_AGENT=1 in the environment
 *
 * SEO_TOOL_HOST_AGENT=0 is a hard off: it wins over the setting, and the
 * Settings page cannot undo it. That is the one to put in a Dockerfile or
 * a server's .env.
 *
 * Synchronous on purpose, like the rest of the runner's database reads.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceSettings } from "@/db/schema";

export const HOST_AGENT_KEY = "host_agent.enabled";
export const HOST_AGENT_ENV = "SEO_TOOL_HOST_AGENT";

export const HOST_AGENT_OFF_MESSAGE =
  "Claude Code on this computer is switched off. Turn it on in Settings → Claude Code on this computer " +
  `(or set ${HOST_AGENT_ENV}=1) if you want the app to run Claude Code, gh and git on this machine.`;

export type HostAgentState = {
  enabled: boolean;
  /** Where the answer came from; "env-off" cannot be changed from Settings. */
  source: "env-off" | "env-on" | "setting" | "default";
};

function envChoice(): boolean | null {
  const v = process.env[HOST_AGENT_ENV]?.trim().toLowerCase();
  if (!v) return null;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return null;
}

export function hostAgentState(): HostAgentState {
  const env = envChoice();
  if (env === false) return { enabled: false, source: "env-off" };
  if (env === true) return { enabled: true, source: "env-on" };
  try {
    const [row] = db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.key, HOST_AGENT_KEY))
      .limit(1)
      .all();
    if (row?.value === true) return { enabled: true, source: "setting" };
  } catch {
    // An unreadable database means "not switched on".
  }
  return { enabled: false, source: "default" };
}

export function isHostAgentEnabled(): boolean {
  return hostAgentState().enabled;
}

/** For route handlers: a response to return when the feature is off, else null. */
export function hostAgentGuard(): Response | null {
  if (isHostAgentEnabled()) return null;
  return Response.json({ ok: false, code: "host_agent_off", error: HOST_AGENT_OFF_MESSAGE }, { status: 403 });
}

/** For code that would spawn a program: throws instead of spawning. */
export function assertHostAgentEnabled(): void {
  if (!isHostAgentEnabled()) throw new Error(HOST_AGENT_OFF_MESSAGE);
}

/** Returns false when the environment forces it off. */
export function saveHostAgentEnabled(enabled: boolean): boolean {
  if (hostAgentState().source === "env-off") return false;
  db.insert(workspaceSettings)
    .values({ key: HOST_AGENT_KEY, value: enabled, updatedAt: new Date() })
    .onConflictDoUpdate({ target: workspaceSettings.key, set: { value: enabled, updatedAt: new Date() } })
    .run();
  return true;
}
