/**
 * A GitHub repo as people write it: "owner/name", a github.com URL, with
 * or without .git, or the ssh form. Stored as "owner/name"; anything that
 * is not one of those is rejected, because the value ends up in commands
 * Claude is allowed to run.
 */

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_])?$/;

export function normalizeGithubRepo(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  s = s
    .replace(/^git@github\.com:/i, "")
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const parts = s.split("/");
  if (parts.length < 2) return null;
  const [owner, name] = parts;
  // /tree/main and similar tails are fine to drop; a different shape is not.
  if (parts.length > 2 && !["tree", "pull", "pulls", "issues", "blob"].includes(parts[2])) return null;
  if (!NAME.test(owner) || !NAME.test(name) || owner.includes(".")) return null;
  return `${owner}/${name}`;
}

/** Git branch names we are willing to put in a command. */
export function isSafeBranch(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(name) && !name.includes("..") && !name.endsWith("/");
}
