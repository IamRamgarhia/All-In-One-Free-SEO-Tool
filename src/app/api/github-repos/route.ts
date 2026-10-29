/**
 * The GitHub repositories this machine's GitHub CLI can see, so a client's
 * repo is picked from a list instead of typed.
 *
 *   GET ?path=<project folder>  →  { ok: true, user, repos, suggested }
 *                                  { ok: false, error, code }
 *
 * The sign-in is the one `gh auth login` already stored on this machine.
 * The token stays inside gh; this route only ever sees the repo list it
 * prints. `suggested` is the folder's own `origin` remote when it points at
 * GitHub, which is almost always the right answer.
 *
 * Same-machine, signed-in-owner requests only, like the other routes that
 * run programs here.
 */

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
import { guardAdminRequest, isLocalRequest } from "@/lib/admin-auth";
import { hostAgentGuard } from "@/lib/host-agent";
import { normalizeGithubRepo } from "@/lib/github-repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const exec = promisify(execFile);
const GH = process.platform === "win32" ? "gh.exe" : "gh";

type ApiRepo = {
  full_name: string;
  default_branch: string;
  private: boolean;
  archived: boolean;
  permissions?: { push?: boolean };
};

async function suggestedFromFolder(path: string | null): Promise<{ repo: string; branch: string | null } | null> {
  if (!path || !isAbsolute(path)) return null;
  try {
    if (!existsSync(path) || !statSync(path).isDirectory()) return null;
    const { stdout } = await exec("git", ["-C", path, "remote", "get-url", "origin"], { timeout: 5000 });
    const repo = normalizeGithubRepo(stdout.trim());
    if (!repo) return null;
    let branch: string | null = null;
    try {
      const head = await exec("git", ["-C", path, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
        timeout: 5000,
      });
      branch = head.stdout.trim().replace(/^origin\//, "") || null;
    } catch {
      // origin/HEAD is not always set; the repo's own default is used instead
    }
    return { repo, branch };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const denied = await guardAdminRequest(req);
  if (denied) return denied;
  const off = hostAgentGuard();
  if (off) return off;
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: "remote", error: "GitHub can only be connected from the computer that runs the app." },
      { status: 400 },
    );
  }

  const path = new URL(req.url).searchParams.get("path");
  const suggested = await suggestedFromFolder(path);

  try {
    const [who, list] = await Promise.all([
      exec(GH, ["api", "user", "--jq", ".login"], { timeout: 15_000 }),
      exec(GH, ["api", "user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member"], {
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
      }),
    ]);
    const repos = (JSON.parse(list.stdout) as ApiRepo[])
      .filter((r) => !r.archived && r.permissions?.push !== false)
      .map((r) => ({ name: r.full_name, defaultBranch: r.default_branch || "main", private: r.private }));
    return Response.json({ ok: true, user: who.stdout.trim(), repos, suggested });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({
        ok: false,
        code: "no_gh",
        error: "The GitHub CLI (gh) is not installed. Install it from cli.github.com, then reload.",
        suggested,
      });
    }
    return Response.json({
      ok: false,
      code: "not_signed_in",
      error: "Not signed in to GitHub. Run `gh auth login` in a terminal, then reload.",
      suggested,
    });
  }
}
