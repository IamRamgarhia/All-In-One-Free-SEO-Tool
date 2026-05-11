/**
 * Update endpoint — checks GitHub for a newer commit + applies it.
 *
 *   GET  → reports local vs remote SHA, computes updateAvailable.
 *   POST → does git pull, runs `pnpm install` if package.json changed,
 *          applies new migrations, logs to activity, and tells the UI
 *          whether a manual restart is needed.
 *
 * Most updates don't need a manual restart because Next.js dev mode
 * hot-reloads file changes. Server-only code (lib/, route.ts) often
 * picks up on next request. We flag `restartRecommended: true` only
 * when package.json changed.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { logActivity } from "@/lib/activity";

const exec = promisify(execFile);

export const dynamic = "force-dynamic";
// Required: spawns git + pnpm + reads package.json. Edge can't.
export const runtime = "nodejs";

const REPO = "IamRamgarhia/seo";
const BRANCH = "main";

async function getLocalSha(): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
    });
    return stdout.trim();
  } catch {
    try {
      const head = readFileSync(path.join(process.cwd(), ".git", "HEAD"), "utf-8").trim();
      if (head.startsWith("ref: ")) {
        const ref = head.slice(5);
        const sha = readFileSync(path.join(process.cwd(), ".git", ref), "utf-8").trim();
        return sha;
      }
      return head;
    } catch {
      return null;
    }
  }
}

async function getRemoteSha(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits/${BRANCH}`,
      {
        headers: { accept: "application/vnd.github+json" },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { sha?: string };
    return data.sha ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [local, remote] = await Promise.all([getLocalSha(), getRemoteSha()]);
  const updateAvailable =
    local !== null && remote !== null && local !== remote;

  // Surface as a notification once per remote-SHA so the bell badges.
  // No-op if logActivity dedupes elsewhere; logActivity itself swallows errors.
  if (updateAvailable && remote) {
    void logActivity({
      kind: "system.update_available",
      message: `New version on GitHub (${remote.slice(0, 7)}). Click to update.`,
      level: "info",
      entityType: "update",
    }).catch(() => undefined);
  }

  return Response.json({
    ok: true,
    local: local?.slice(0, 7) ?? null,
    remote: remote?.slice(0, 7) ?? null,
    updateAvailable,
    diffUrl:
      local && remote
        ? `https://github.com/${REPO}/compare/${local.slice(0, 7)}...${remote.slice(0, 7)}`
        : `https://github.com/${REPO}/commits/${BRANCH}`,
  });
}

type Step = { name: string; status: "ok" | "skip" | "error"; detail?: string };

function packageJsonHash(): string | null {
  try {
    const buf = readFileSync(path.join(process.cwd(), "package.json"));
    // FNV-1a style cheap hash; we only need to detect changes
    let h = 2166136261;
    for (let i = 0; i < buf.length; i++) {
      h = (h ^ buf[i]) >>> 0;
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16);
  } catch {
    return null;
  }
}

async function detectPm(): Promise<"pnpm" | "npm"> {
  try {
    await exec("pnpm", ["--version"], { cwd: process.cwd(), timeout: 5_000 });
    return "pnpm";
  } catch {
    return "npm";
  }
}

export async function POST() {
  if (process.env.RUNNING_IN_DOCKER === "1") {
    return Response.json(
      {
        ok: false,
        error:
          "Inside Docker — update by running on the host: `cd ~/seo && git pull && docker compose up -d --build`",
      },
      { status: 400 },
    );
  }

  try {
    await exec("git", ["--version"], { cwd: process.cwd() });
  } catch {
    return Response.json(
      {
        ok: false,
        error:
          "git not found on the server — re-run the install command from the README to upgrade.",
      },
      { status: 500 },
    );
  }

  const steps: Step[] = [];
  let restartRecommended = false;

  const pkgHashBefore = packageJsonHash();

  // 1. fetch + merge
  try {
    await exec("git", ["fetch", "origin", BRANCH], {
      cwd: process.cwd(),
      timeout: 60_000,
    });
    steps.push({ name: "Fetch from GitHub", status: "ok" });
  } catch (err) {
    steps.push({
      name: "Fetch from GitHub",
      status: "error",
      detail: (err as Error).message,
    });
    return Response.json({ ok: false, error: "git fetch failed", steps }, { status: 500 });
  }

  // 2. Try fast-forward pull first. If it fails because of dirty / untracked
  //    files (very common when the user installed via the ZIP installer —
  //    files end up locally but git doesn't track them), automatically
  //    fall back to a force-sync: clean workspace + hard-reset to origin.
  //    data.db, .env.local, and other gitignored files are NEVER touched
  //    by either path because they're in .gitignore.
  let pulledStrategy: "ff" | "force-sync" = "ff";
  try {
    const { stdout } = await exec("git", ["pull", "--ff-only"], {
      cwd: process.cwd(),
      timeout: 60_000,
    });
    if (/Already up to date|already up.to.date/i.test(stdout)) {
      steps.push({ name: "Pull latest commit", status: "skip", detail: "Already on latest" });
      return Response.json({
        ok: true,
        message: "You're already on the latest version.",
        steps,
        restartRecommended: false,
      });
    }
    const lastLine = stdout.split("\n").filter(Boolean).slice(-1)[0] ?? "Pulled";
    steps.push({ name: "Pull latest commit", status: "ok", detail: lastLine.slice(0, 80) });
  } catch (ffErr) {
    // Fast-forward failed (dirty tree / untracked file conflicts / diverged
    // branch). Do a force-sync: clean tracked + untracked overrides, hard
    // reset to remote. Gitignored files (data.db, .env.local, node_modules,
    // .next, dev-server.log) are PRESERVED.
    steps.push({
      name: "Pull latest commit",
      status: "skip",
      detail: "Fast-forward blocked — switching to force-sync",
    });

    try {
      // First, clean any untracked files that would block the reset.
      // -f = force, -d = include dirs, -x DOES exist but we use plain -fd
      // because we want gitignored files (data.db!) preserved.
      await exec("git", ["clean", "-fd"], {
        cwd: process.cwd(),
        timeout: 30_000,
      });
      steps.push({
        name: "Clear conflicting untracked files",
        status: "ok",
        detail: "data.db / .env.local are gitignored and were preserved",
      });

      // Reset tracked files to match origin/main exactly.
      const { stdout: resetOut } = await exec(
        "git",
        ["reset", "--hard", `origin/${BRANCH}`],
        { cwd: process.cwd(), timeout: 60_000 },
      );
      const head = resetOut.match(/HEAD is now at ([0-9a-f]+)/)?.[1] ?? "";
      steps.push({
        name: "Force-sync to latest",
        status: "ok",
        detail: head ? `HEAD ${head}` : resetOut.slice(0, 80),
      });
      pulledStrategy = "force-sync";
    } catch (syncErr) {
      steps.push({
        name: "Force-sync to latest",
        status: "error",
        detail: (syncErr as Error).message,
      });
      return Response.json(
        {
          ok: false,
          error: `Fast-forward pull failed (${(ffErr as Error).message.slice(0, 120)}) and force-sync also failed (${(syncErr as Error).message.slice(0, 120)}). Re-run the installer command from your README — it handles this case cleanly.`,
          steps,
        },
        { status: 500 },
      );
    }
  }

  // 2. detect package.json change → run install
  const pkgHashAfter = packageJsonHash();
  if (pkgHashBefore !== pkgHashAfter) {
    restartRecommended = true;
    try {
      const pm = await detectPm();
      await exec(pm, ["install"], {
        cwd: process.cwd(),
        timeout: 300_000,
      });
      steps.push({
        name: "Install new dependencies",
        status: "ok",
        detail: `${pm} install`,
      });
    } catch (err) {
      steps.push({
        name: "Install new dependencies",
        status: "error",
        detail: (err as Error).message,
      });
    }
  } else {
    steps.push({
      name: "Install new dependencies",
      status: "skip",
      detail: "package.json unchanged",
    });
  }

  // 3. apply any new migrations
  try {
    const migrateScript = path.join(process.cwd(), "scripts", "migrate.cjs");
    if (existsSync(migrateScript)) {
      const { stdout } = await exec("node", [migrateScript], {
        cwd: process.cwd(),
        timeout: 60_000,
      });
      const applied = stdout.match(/\d+ new migration/);
      steps.push({
        name: "Apply database migrations",
        status: applied ? "ok" : "skip",
        detail: applied ? applied[0] : "Schema already current",
      });
    } else {
      steps.push({
        name: "Apply database migrations",
        status: "skip",
        detail: "no migrate script",
      });
    }
  } catch (err) {
    steps.push({
      name: "Apply database migrations",
      status: "error",
      detail: (err as Error).message,
    });
  }

  // 4. log activity so it surfaces in the bell
  const newSha = (await getLocalSha())?.slice(0, 7) ?? "latest";
  await logActivity({
    kind: "system.updated",
    message: `Updated to commit ${newSha}${restartRecommended ? " — restart required for new dependencies" : ""}`,
    level: "success",
  }).catch(() => undefined);

  const baseMessage = restartRecommended
    ? "Update applied. Restart the server to load the new dependencies."
    : "Update applied. Next.js will hot-reload the changes — refresh the page in a few seconds.";
  const forceSyncNote =
    pulledStrategy === "force-sync"
      ? " (Force-synced to match GitHub. data.db + .env.local preserved.)"
      : "";

  return Response.json({
    ok: true,
    message: baseMessage + forceSyncNote,
    steps,
    restartRecommended,
    forceSynced: pulledStrategy === "force-sync",
  });
}
