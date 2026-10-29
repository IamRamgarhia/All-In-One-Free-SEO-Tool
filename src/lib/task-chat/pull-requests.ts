/**
 * The pull requests Claude opened for tasks (branches `seo/task-<id>-…`, or `seo/batch-…` for a whole run),
 * and merging them from the app: one at a time, or all that are ready.
 *
 * Work goes through the GitHub CLI's own sign-in; the token never reaches
 * the app. A pull request is only merged when GitHub says it can be and
 * every check on it is green, the same rule Claude follows in "Open and
 * merge" mode. The state is read again right before each merge, so a
 * button pressed on a stale list cannot merge something that has changed.
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

/** seo/task-<id>-… (one task) or seo/batch-<date> (a whole run). */
export const TASK_BRANCH = /^seo\/(?:task-(\d+)(?:-|$)|batch-\d)/;

export type CheckState = "passing" | "pending" | "failing" | "none";

export type TaskPr = {
  number: number;
  title: string;
  url: string;
  branch: string;
  /** Null for a pull request that covers a whole run. */
  taskId: number | null;
  checks: CheckState;
  /** True when GitHub reports no conflicts. */
  mergeable: boolean;
  draft: boolean;
  /** Safe to merge now: not a draft, no conflicts, checks passing (or none exist). */
  ready: boolean;
};

type Rollup = { status?: string; conclusion?: string; state?: string };

export function checkState(rollup: Rollup[] | null | undefined): CheckState {
  if (!rollup || rollup.length === 0) return "none";
  let pending = false;
  for (const c of rollup) {
    // A check run has status + conclusion; a commit status has only state.
    const state = (c.state ?? "").toUpperCase();
    const status = (c.status ?? "").toUpperCase();
    const conclusion = (c.conclusion ?? "").toUpperCase();
    if (state) {
      if (state === "PENDING" || state === "EXPECTED") pending = true;
      else if (state !== "SUCCESS") return "failing";
    } else if (status && status !== "COMPLETED") {
      pending = true;
    } else if (!["SUCCESS", "NEUTRAL", "SKIPPED"].includes(conclusion)) {
      return "failing";
    }
  }
  return pending ? "pending" : "passing";
}

type RawPr = {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  isDraft: boolean;
  mergeable: string;
  statusCheckRollup: Rollup[] | null;
};

export function toTaskPr(raw: RawPr): TaskPr | null {
  const m = TASK_BRANCH.exec(raw.headRefName);
  if (!m) return null;
  const checks = checkState(raw.statusCheckRollup);
  const mergeable = raw.mergeable === "MERGEABLE";
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    branch: raw.headRefName,
    taskId: m[1] ? Number(m[1]) : null,
    checks,
    mergeable,
    draft: raw.isDraft,
    ready: !raw.isDraft && mergeable && (checks === "passing" || checks === "none"),
  };
}

const FIELDS = "number,title,url,headRefName,isDraft,mergeable,statusCheckRollup";

function explain(err: unknown): string {
  const e = err as { code?: string; stderr?: string; message?: string };
  if (e.code === "ENOENT") return "The GitHub CLI (gh) is not installed.";
  return (e.stderr || e.message || "GitHub did not answer.").toString().trim().split("\n")[0];
}

export async function listTaskPrs(
  repo: string,
): Promise<{ ok: true; prs: TaskPr[] } | { ok: false; error: string }> {
  const r = normalizeGithubRepo(repo);
  if (!r) return { ok: false, error: "The saved GitHub repository is not valid." };
  try {
    const { stdout } = await exec(
      GH,
      ["pr", "list", "--repo", r, "--state", "open", "--limit", "100", "--json", FIELDS],
      { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const prs = (JSON.parse(stdout) as RawPr[])
      .map(toTaskPr)
      .filter((p): p is TaskPr => p !== null)
      .sort((a, b) => a.number - b.number);
    return { ok: true, prs };
  } catch (err) {
    return { ok: false, error: explain(err) };
  }
}

async function viewPr(repo: string, number: number): Promise<TaskPr | null> {
  const { stdout } = await exec(
    GH,
    ["pr", "view", String(number), "--repo", repo, "--json", `${FIELDS},state`],
    { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
  );
  const raw = JSON.parse(stdout) as RawPr & { state: string };
  return raw.state === "OPEN" ? toTaskPr(raw) : null;
}

export type MergeResult = { number: number; ok: boolean; message: string };

/** Merge one pull request, if it is still a task PR and still ready. */
export async function mergeTaskPr(repo: string, number: number, base: string): Promise<MergeResult> {
  const r = normalizeGithubRepo(repo);
  if (!r || !Number.isInteger(number) || number <= 0 || !isSafeBranch(base)) {
    return { number, ok: false, message: "Bad request." };
  }
  try {
    const pr = await viewPr(r, number);
    if (!pr) return { number, ok: false, message: "Not an open task pull request." };
    if (pr.draft) return { number, ok: false, message: "It is a draft." };
    if (!pr.mergeable) return { number, ok: false, message: "It has conflicts with the base branch." };
    if (pr.checks === "failing") return { number, ok: false, message: "A check failed." };
    if (pr.checks === "pending") return { number, ok: false, message: "Checks are still running." };
    await exec(GH, ["pr", "merge", String(number), "--repo", r, "--squash", "--delete-branch"], {
      timeout: 60_000,
    });
    return { number, ok: true, message: "Merged." };
  } catch (err) {
    return { number, ok: false, message: explain(err) };
  }
}

/**
 * Every ready pull request, oldest first, one after another. After each
 * merge the base branch moved, so the next one is checked again by
 * mergeTaskPr; one that now conflicts is reported and the rest go on.
 */
export async function mergeAllReady(
  repo: string,
  base: string,
): Promise<{ ok: true; results: MergeResult[] } | { ok: false; error: string }> {
  const listed = await listTaskPrs(repo);
  if (!listed.ok) return listed;
  const results: MergeResult[] = [];
  for (const pr of listed.prs.filter((p) => p.ready)) {
    results.push(await mergeTaskPr(repo, pr.number, base));
  }
  return { ok: true, results };
}
