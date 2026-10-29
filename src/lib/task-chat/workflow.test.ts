import { describe, expect, it } from "vitest";
import { batchBranchName, batchPrBody } from "./batch";
import { alwaysDenied, extraAllowedTools, workflowNote, type Workflow } from "./workflow";

const base: Workflow = { githubRepo: "o/r", baseBranch: "main", prMode: "pr_batch" };

describe("one pull request per run", () => {
  it("names the branch after the time of the run", () => {
    expect(batchBranchName(new Date(2026, 9, 26, 12, 40))).toBe("seo/batch-20261026-1240");
  });

  it("never lets Claude push or open the pull request inside a run", () => {
    const w = { ...base, batchBranch: "seo/batch-20261026-1240" };
    const allowed = extraAllowedTools(w);
    expect(allowed).toContain("Bash(git commit:*)");
    expect(allowed).not.toContain("Bash(git push:*)");
    expect(allowed).not.toContain("Bash(gh pr create:*)");
    expect(allowed).not.toContain("Bash(gh pr merge:*)");
    expect(alwaysDenied(w)).toContain("Bash(git push:*)");
  });

  it("tells Claude to commit on the run's branch and leave the push to the app", () => {
    const note = workflowNote({ ...base, batchBranch: "seo/batch-20261026-1240" }, 5);
    expect(note).toContain("seo/batch-20261026-1240");
    expect(note).toMatch(/Do not push/);
  });

  it("works like a pull request per task outside a run", () => {
    const allowed = extraAllowedTools(base);
    expect(allowed).toContain("Bash(git push:*)");
    expect(allowed).toContain("Bash(gh pr create:*)");
    expect(alwaysDenied(base)).not.toContain("Bash(git push:*)");
    expect(workflowNote(base, 5)).toContain("seo/task-5-");
  });

  it("lists the tasks in the pull request body", () => {
    const body = batchPrBody([
      { id: 3, title: "Fix titles", done: true },
      { id: 4, title: "Add alt text", done: false },
    ]);
    expect(body).toContain("- [x] #3 Fix titles");
    expect(body).toContain("- [ ] #4 Add alt text");
  });
});
