/**
 * Who may use a client's code circuit, and from where.
 *
 *   - Owners and managers only, for everything: the copied prompt, the
 *     project settings, Claude Code, the pull requests. Members and client
 *     viewers do not see it.
 *   - Anything that runs a program on this machine (Claude Code, gh, git)
 *     also needs the client's switch on (lib/host-agent) and a request
 *     from this very machine: a coding agent is not something to start
 *     from a browser elsewhere on the network.
 *
 * Route handlers get a JSON refusal with a stable `code` the page words in
 * the person's language (clientCode.reasons).
 */

import { currentUser, effectiveRole, requireClientAccess, AccessDeniedError } from "@/lib/auth";
import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { codeAgentState } from "@/lib/host-agent";

export async function mayUseClientCode(): Promise<boolean> {
  try {
    const role = effectiveRole(await currentUser());
    return role === "owner" || role === "manager";
  } catch {
    return false;
  }
}

/** For server actions: throws unless the caller is an owner or a manager. */
export async function assertClientCodeRole(): Promise<void> {
  if (!(await mayUseClientCode())) throw new AccessDeniedError("Owners and managers only.");
}

function refuse(code: string, status: number): Response {
  return Response.json({ ok: false, code }, { status });
}

/**
 * For route handlers. `host: true` for anything that runs a program on
 * this machine.
 */
export async function guardClientCodeRequest(
  req: Request,
  clientId: number,
  opts: { host?: boolean } = {},
): Promise<Response | null> {
  const denied = guardAdminRequest(req);
  if (denied) return denied;
  if (!(await mayUseClientCode())) return refuse("role", 403);
  try {
    await requireClientAccess(clientId);
  } catch (err) {
    if (err instanceof AccessDeniedError) return refuse("not_found", 404);
    throw err;
  }
  if (!opts.host) return null;
  const state = codeAgentState(clientId);
  if (!state.enabled) return refuse(state.reason, 403);
  if (!isLocalRequest(req)) return refuse("not_local", 400);
  return null;
}
