import path from "node:path";
import { describe, expect, it } from "vitest";
import { documentsRoot, isInside, taskDocumentsDir, workingFilesNote } from "./documents";
import { ALLOWED_TOOLS, turnArgs } from "./runner";

const project = "/home/me/sites/client";

describe("documents that are not part of the site", () => {
  it("go to a folder outside the client's project", () => {
    const dir = taskDocumentsDir(12, "/srv/app/claude-documents");
    expect(dir).toBe(path.join("/srv/app/claude-documents", "task-12"));
    expect(isInside(project, dir)).toBe(false);
    expect(workingFilesNote(12, project, "/srv/app/claude-documents")).toContain(dir);
    expect(workingFilesNote(12, project, "/srv/app/claude-documents")).toMatch(/never commit it/);
  });

  it("refuse a project folder that would contain them", () => {
    expect(workingFilesNote(12, "/srv/app", "/srv/app/claude-documents")).toBeNull();
    expect(isInside("/srv/app", "/srv/app")).toBe(true);
    expect(isInside("/srv/app", "/srv/application")).toBe(false);
  });

  it("sit next to the app's database", () => {
    expect(documentsRoot().endsWith("claude-documents")).toBe(true);
  });
});

describe("the arguments of one turn", () => {
  const target = (prMode: "off" | "pr" | "pr_batch", batchBranch?: string) => ({
    clientId: 1,
    dir: project,
    workflow: { githubRepo: "agency/site", baseBranch: "main", prMode, batchBranch },
  });

  it("edits files only, with no git writes, when the client says files only", () => {
    const args = turnArgs(5, target("off"), "fr", null)!;
    expect(args).toContain("--add-dir");
    expect(args).not.toContain("Bash(git push:*)");
    expect(args).not.toContain("Bash(git commit:*)");
    expect(args.join(" ")).toContain("Answer in French");
  });

  it("never lets Claude merge, push to the base branch or rewrite history", () => {
    const args = turnArgs(5, target("pr"), "en", null)!;
    const denied = args.slice(args.indexOf("--disallowedTools") + 1);
    expect(denied).toContain("Bash(gh pr merge:*)");
    expect(denied).toContain("Bash(git push origin main:*)");
    expect(denied).toContain("Bash(git push --force:*)");
    expect(denied).toContain("Bash(git reset:*)");
    expect(args).not.toContain("--resume");
  });

  it("does not push inside a one-pull-request run", () => {
    const args = turnArgs(5, target("pr_batch", "seo/batch-20261124-1000"), "en", "sess-1")!;
    const denied = args.slice(args.indexOf("--disallowedTools") + 1);
    expect(denied).toContain("Bash(git push:*)");
    expect(args.slice(args.indexOf("--resume"))).toEqual(["--resume", "sess-1"]);
  });

  it("reads no settings file and no MCP server from the client's repository", () => {
    const args = turnArgs(5, target("off"), "en", null)!;
    expect(args.slice(args.indexOf("--setting-sources"), args.indexOf("--setting-sources") + 2)).toEqual([
      "--setting-sources",
      "",
    ]);
    expect(args).toContain("--strict-mcp-config");
  });

  it("keeps the base set read-mostly and without the app's MCP", () => {
    expect(ALLOWED_TOOLS).not.toContain("Bash");
    expect(ALLOWED_TOOLS.some((t) => t.startsWith("mcp__"))).toBe(false);
  });
});
