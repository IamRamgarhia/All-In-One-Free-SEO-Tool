import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_SLUG, REPO_URL, REPO_API_URL } from "./repo";

/**
 * The repository was renamed. Ten places in src/ had the slug hardcoded
 * and seven still said the old name — including the update checker,
 * which polls GitHub for new commits, and the installer one-liner in the
 * README.
 *
 * They all still worked, because GitHub redirects a renamed repo. That
 * is the dangerous kind of broken: it stops the day somebody else
 * registers the old name, and then `curl … | bash` fetches a stranger's
 * script and the update checker follows a stranger's commits.
 *
 * So: one constant, and this test fails the build if a literal shows up
 * anywhere else — including the three files that cannot import it.
 */

const ROOT = process.cwd();
const OLD_SLUG = "IamRamgarhia/SEO-Tool";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|cjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("the GitHub slug lives in one place", () => {
  it("is the name GitHub actually serves today", () => {
    // Not a guess: this is the slug every URL in the app is built from.
    expect(REPO_SLUG).toBe("IamRamgarhia/All-In-One-Free-SEO-Tool");
    expect(REPO_URL).toBe(`https://github.com/${REPO_SLUG}`);
    expect(REPO_API_URL).toBe(`https://api.github.com/repos/${REPO_SLUG}`);
  });

  it("no source file still points at the old name", () => {
    const offenders = walk(join(ROOT, "src"))
      // repo.ts and this file name the old slug on purpose, to explain
      // the rule and to check for it.
      .filter((f) => !f.endsWith(join("lib", "repo.ts")))
      .filter((f) => !f.endsWith(join("lib", "repo.test.ts")))
      .filter((f) => readFileSync(f, "utf8").includes(OLD_SLUG))
      .map((f) => relative(ROOT, f));
    expect(
      offenders,
      `These still use the pre-rename slug and only work via GitHub's ` +
        `rename redirect:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no source file hardcodes the slug instead of importing it", () => {
    const offenders = walk(join(ROOT, "src"))
      .filter((f) => !f.endsWith(join("lib", "repo.ts")))
      .filter((f) => !f.endsWith(join("lib", "repo.test.ts")))
      .filter((f) => readFileSync(f, "utf8").includes(REPO_SLUG))
      .map((f) => relative(ROOT, f));
    expect(
      offenders,
      `Import from "@/lib/repo" instead of writing the slug again:\n  ` +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("the installers and package.json agree, since they cannot import it", () => {
    // install.sh and install.ps1 download the project zip by this name.
    // Get it wrong and the one-line installer 404s, or worse, succeeds
    // against somebody else's repository.
    for (const file of ["install.sh", "install.ps1", "package.json"]) {
      const text = readFileSync(join(ROOT, file), "utf8");
      expect(text.includes(OLD_SLUG), `${file} still has the old slug`).toBe(false);
      expect(text.includes(REPO_SLUG), `${file} does not mention the repo`).toBe(true);
    }
  });

  it("the installers fetch the zip from the current name", () => {
    // The pair that actually decides what gets downloaded and run.
    const sh = readFileSync(join(ROOT, "install.sh"), "utf8");
    const ps = readFileSync(join(ROOT, "install.ps1"), "utf8");
    expect(sh).toContain('REPO_NAME="All-In-One-Free-SEO-Tool"');
    expect(ps).toContain('$repoName    = "All-In-One-Free-SEO-Tool"');
  });
});
