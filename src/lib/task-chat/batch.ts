/**
 * "One pull request per run": Claude commits every task of a queue run on
 * one branch and never pushes. When the run ends, the app pushes that
 * branch once and opens a single pull request, so the host builds one
 * preview and one production deploy for the whole run instead of one per
 * task.
 *
 * The push and the pull request are made here, not by Claude: it is a few
 * fixed commands, and the model does not need to be trusted with them.
 */

import { assertHostAgentEnabled } from "@/lib/host-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isSafeBranch, normalizeGithubRepo } from "@/lib/github-repo";

const run = promisify(execFile);
// gh and git run on the host, so they obey the same switch as Claude itself.
const exec = ((...args: Parameters<typeof run>) => {
  assertHostAgentEnabled();
  return run(...args);
}) as typeof run;
const GH = process.platform === "win32" ? "gh.exe" : "gh";

export type BatchRun = {
  dir: string;
  repo: string;
  base: string;
  branch: string;
};

/** seo/batch-20261026-1240, in local time. */
export function batchBranchName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `seo/batch-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

export type BatchTask = { id: number; title: string; done: boolean };

export function batchPrBody(tasks: BatchTask[]): string {
  const lines = tasks.map((t) => `- [${t.done ? "x" : " "}] #${t.id} ${t.title}`);
  return [
    "Every task below was worked by Claude Code in one run and committed on this branch, one commit per task.",
    "",
    ...lines,
    "",
    "Merging this builds and deploys the site once for all of them.",
  ].join("\n");
}

function firstLine(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  return (e.stderr || e.message || "failed").toString().trim().split("\n")[0];
}

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", dir, ...args], { timeout: 120_000 });
  return stdout.trim();
}

/**
 * Push the run's branch and open its pull request (or reuse the open one).
 * Returns a sentence for the queue note.
 */
export async function closeBatch(run: BatchRun, tasks: BatchTask[]): Promise<string> {
  const repo = normalizeGithubRepo(run.repo);
  if (!repo || !isSafeBranch(run.branch) || !isSafeBranch(run.base)) {
    return "The batch pull request was not made: the repository or branch is not valid.";
  }
  try {
    const exists = await git(run.dir, ["branch", "--list", run.branch]);
    if (!exists) {
      return "No pull request: Claude did not commit anything on the batch branch.";
    }
    const ahead = Number(await git(run.dir, ["rev-list", "--count", `${run.base}..${run.branch}`]));
    if (!(ahead > 0)) {
      return "No pull request: nothing was committed on the batch branch.";
    }

    await git(run.dir, ["push", "-u", "origin", run.branch]);

    const listed = await exec(
      GH,
      ["pr", "list", "--repo", repo, "--head", run.branch, "--state", "open", "--json", "url"],
      { timeout: 30_000 },
    );
    let url = (JSON.parse(listed.stdout) as { url: string }[])[0]?.url;
    if (!url) {
      const done = tasks.filter((t) => t.done).length;
      const created = await exec(
        GH,
        [
          "pr",
          "create",
          "--repo",
          repo,
          "--base",
          run.base,
          "--head",
          run.branch,
          "--title",
          `SEO: ${ahead} change${ahead === 1 ? "" : "s"} from one run (${done} task${done === 1 ? "" : "s"} done)`,
          "--body",
          batchPrBody(tasks),
        ],
        { timeout: 60_000 },
      );
      url = created.stdout.trim().split("\n").pop() ?? "";
    }

    // Leave the folder on the base branch, as it was found.
    await git(run.dir, ["switch", run.base]).catch(() => "");
    return `One pull request for the whole run: ${url}`;
  } catch (err) {
    return `The batch pull request was not made: ${firstLine(err)}. The commits are on ${run.branch} in the project folder.`;
  }
}
