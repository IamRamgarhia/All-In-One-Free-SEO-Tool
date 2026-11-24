/**
 * The pull requests Claude opened for tasks (branches `seo/task-<id>-…`, or `seo/batch-…` for a whole run),
 * and merging them from the app: one at a time, or all that are ready.
 *
 * Work goes through the GitHub CLI's own sign-in; the token never reaches
 * the app. A pull request is only merged when GitHub says it can be and
 * every check on it is green, and only after a person confirmed it in the
 * app. The state is read again right before each merge, so a
 * button pressed on a stale list cannot merge something that has changed.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isSafeBranch, normalizeGithubRepo } from "@/lib/github-repo";

// The route that calls these checks the client's switch, the role and that
// the request comes from this machine before anything here runs `gh`.
const exec = promisify(execFile);
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

/** Why gh failed: "no_gh" when it is not installed, else its first line of output. */
export type GhFailure = { code: "no_gh" | "gh_error"; detail?: string };

function explain(err: unknown): GhFailure {
  const e = err as { code?: string; stderr?: string; message?: string };
  if (e.code === "ENOENT") return { code: "no_gh" };
  return {
    code: "gh_error",
    detail: (e.stderr || e.message || "").toString().trim().split("\n")[0].slice(0, 300),
  };
}

export async function listTaskPrs(
  repo: string,
): Promise<{ ok: true; prs: TaskPr[] } | ({ ok: false } & PrFailure)> {
  const r = normalizeGithubRepo(repo);
  if (!r) return { ok: false, code: "bad_repo" };
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
    return { ok: false, ...explain(err) };
  }
}

export type PrFailure = { code: "bad_repo" | GhFailure["code"]; detail?: string };

async function viewPr(repo: string, number: number): Promise<TaskPr | null> {
  const { stdout } = await exec(
    GH,
    ["pr", "view", String(number), "--repo", repo, "--json", `${FIELDS},state`],
    { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
  );
  const raw = JSON.parse(stdout) as RawPr & { state: string };
  return raw.state === "OPEN" ? toTaskPr(raw) : null;
}

export type MergeCode =
  | "merged"
  | "bad_request"
  | "not_open"
  | "draft"
  | "conflicts"
  | "check_failed"
  | "checks_pending"
  | GhFailure["code"];

export type MergeResult = { number: number; ok: boolean; code: MergeCode; detail?: string };

/** Merge one pull request, if it is still a task PR and still ready. */
export async function mergeTaskPr(repo: string, number: number, base: string): Promise<MergeResult> {
  const r = normalizeGithubRepo(repo);
  if (!r || !Number.isInteger(number) || number <= 0 || !isSafeBranch(base)) {
    return { number, ok: false, code: "bad_request" };
  }
  try {
    const pr = await viewPr(r, number);
    if (!pr) return { number, ok: false, code: "not_open" };
    if (pr.draft) return { number, ok: false, code: "draft" };
    if (!pr.mergeable) return { number, ok: false, code: "conflicts" };
    if (pr.checks === "failing") return { number, ok: false, code: "check_failed" };
    if (pr.checks === "pending") return { number, ok: false, code: "checks_pending" };
    await exec(GH, ["pr", "merge", String(number), "--repo", r, "--squash", "--delete-branch"], {
      timeout: 60_000,
    });
    return { number, ok: true, code: "merged" };
  } catch (err) {
    return { number, ok: false, ...explain(err) };
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
): Promise<{ ok: true; results: MergeResult[] } | ({ ok: false } & PrFailure)> {
  const listed = await listTaskPrs(repo);
  if (!listed.ok) return listed;
  const results: MergeResult[] = [];
  for (const pr of listed.prs.filter((p) => p.ready)) {
    results.push(await mergeTaskPr(repo, pr.number, base));
  }
  return { ok: true, results };
}
