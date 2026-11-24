"use server";

import { revalidatePath } from "next/cache";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { requireSignedIn } from "@/lib/action-guard";
import { logActivity } from "@/lib/activity";
import { requireClientAccess } from "@/lib/auth";
import { assertClientCodeRole } from "@/lib/code-agent-access";
import { isSafeBranch, normalizeGithubRepo } from "@/lib/github-repo";
import { hostAgentForcedOff } from "@/lib/host-agent";

/**
 * The client's code settings, from the project's settings tab: where the
 * source lives, the GitHub repository, how Claude Code hands work back,
 * and the client's own switch for Claude Code on this machine.
 *
 * No token is taken or stored: GitHub goes through the `gh` sign-in
 * already on the machine. Owners and managers only.
 */

export type SaveCodeResult =
  | { ok: true }
  | { ok: false; code: "role" | "bad_folder" | "bad_repo" | "bad_branch" | "env_off" | "need_folder" };

const PR_MODES = ["off", "pr", "pr_batch"] as const;

export async function saveClientCode(
  _prev: SaveCodeResult | null,
  formData: FormData,
): Promise<SaveCodeResult> {
  await requireSignedIn();
  try {
    await assertClientCodeRole();
  } catch {
    return { ok: false, code: "role" };
  }
  const clientId = Number(formData.get("clientId"));
  if (!Number.isInteger(clientId) || clientId <= 0) return { ok: false, code: "role" };
  await requireClientAccess(clientId, { edit: true });

  const localPath = String(formData.get("localPath") ?? "").trim().slice(0, 500);
  if (localPath && !path.isAbsolute(localPath)) return { ok: false, code: "bad_folder" };

  const repoInput = String(formData.get("githubRepo") ?? "").trim();
  const githubRepo = repoInput ? normalizeGithubRepo(repoInput) : null;
  if (repoInput && !githubRepo) return { ok: false, code: "bad_repo" };

  const baseBranch = String(formData.get("baseBranch") ?? "").trim() || "main";
  if (!isSafeBranch(baseBranch)) return { ok: false, code: "bad_branch" };

  const rawMode = String(formData.get("prMode") ?? "off");
  const mode = (PR_MODES as readonly string[]).includes(rawMode) ? (rawMode as (typeof PR_MODES)[number]) : "off";
  // A pull-request mode with no repository to open them on would only fail.
  const prMode = githubRepo ? mode : "off";

  const enable = formData.get("codeAgentEnabled") === "on";
  if (enable && hostAgentForcedOff()) return { ok: false, code: "env_off" };
  if (enable && !localPath) return { ok: false, code: "need_folder" };

  const [before] = await db
    .select({ codeAgentEnabled: clients.codeAgentEnabled })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  await db
    .update(clients)
    .set({
      localPath: localPath || null,
      githubRepo,
      baseBranch,
      prMode,
      codeAgentEnabled: enable,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));

  if (before && before.codeAgentEnabled !== enable) {
    await logActivity({
      kind: enable ? "client.code_agent_on" : "client.code_agent_off",
      message: enable
        ? "Claude Code switched on for this client's code"
        : "Claude Code switched off for this client's code",
      messageFr: enable
        ? "Claude Code activé pour le code de ce client"
        : "Claude Code désactivé pour le code de ce client",
      level: "info",
      clientId,
      entityType: "client",
      entityId: clientId,
    });
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/tasks");
  return { ok: true };
}
