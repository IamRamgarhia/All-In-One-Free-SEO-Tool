/**
 * What the tool list promises about itself.
 *
 * An MCP client decides whether to ask the user before calling a tool
 * from `annotations.readOnlyHint`. Three tools here change a live
 * website. If one of them is ever labelled read-only, an assistant will
 * rewrite somebody's homepage title without asking, and the first anyone
 * hears of it is the page.
 *
 * The annotations default to read-only, which is right for the sixteen
 * tools that read and catastrophic for the seven that write — so the
 * default is exactly the thing that needs a test. The failure is silent
 * by construction: a wrong hint changes no behaviour here, only what
 * somebody else's client decides to do with it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_LIST, READ_ONLY_TOOLS } from "./server";

/** Tools that change a live website or this install's data. */
const WRITERS = new Set([
  "run_agent",
  "apply_fix",
  "revert_agent_action",
  "update_client_knowledge",
  "save_review_draft",
  "reply_to_review",
  "log_client_research",
  "update_task",
]);

describe("tool annotations", () => {
  it("never calls a write tool read-only", () => {
    const lying = MCP_TOOL_LIST.filter(
      (t) => WRITERS.has(t.name) && t.annotations.readOnlyHint !== false,
    ).map((t) => t.name);
    expect(
      lying,
      `These change something and claim to be read-only. An assistant ` +
        `reads that as "safe to call without asking".`,
    ).toEqual([]);
  });

  it("marks everything that touches a live surface as destructive", () => {
    // Every one records an undo, which makes them reversible, not
    // harmless. The hint is about whether to ask first.
    for (const name of ["run_agent", "apply_fix", "revert_agent_action", "reply_to_review"]) {
      const tool = MCP_TOOL_LIST.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(
        (tool!.annotations as { destructiveHint?: boolean }).destructiveHint,
        name,
      ).toBe(true);
    }
  });

  it("does not call a read tool destructive", () => {
    // The mirror failure, and a real cost: an assistant that asks
    // permission before every lookup is one nobody leaves connected.
    const overcautious = MCP_TOOL_LIST.filter(
      (t) =>
        !WRITERS.has(t.name) &&
        (t.annotations as { destructiveHint?: boolean }).destructiveHint === true,
    ).map((t) => t.name);
    expect(overcautious).toEqual([]);
  });

  it("gives every tool an annotation", () => {
    // Guards the guard: an empty or partial list passes everything above.
    expect(MCP_TOOL_LIST.length).toBeGreaterThanOrEqual(20);
    for (const t of MCP_TOOL_LIST) {
      expect(t.annotations, t.name).toBeDefined();
      expect(typeof t.annotations.readOnlyHint, t.name).toBe("boolean");
    }
  });
});

describe("the tool list itself", () => {
  it("has no duplicate names", () => {
    // Two tools with one name is a tool that silently does not exist:
    // dispatch does a find() and the second is unreachable.
    const names = MCP_TOOL_LIST.map((t) => t.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it("names every writer it claims to know about", () => {
    // Keeps WRITERS honest. A write tool added later and left out of
    // that set would inherit the read-only default and pass every test
    // above, which is the exact hole these tests exist to close.
    const missing = [...WRITERS].filter(
      (name) => !MCP_TOOL_LIST.some((t) => t.name === name),
    );
    expect(missing, `${missing.join(", ")} is listed as a writer but not registered.`).toEqual(
      [],
    );
  });

  it("describes what each tool is for", () => {
    for (const t of MCP_TOOL_LIST) {
      expect(t.description?.length ?? 0, t.name).toBeGreaterThan(40);
    }
  });
});

/**
 * The read-only token exists so a chat app can be given something that
 * answers questions and cannot edit a live website. What makes that true
 * is this list, and it is derived from the annotations — so the test
 * that matters is whether a writer can end up in it.
 */
describe("what a read-only connection can reach", () => {
  it("excludes every tool that writes", () => {
    const leaked = READ_ONLY_TOOLS.filter((t) => WRITERS.has(t.name)).map((t) => t.name);
    expect(
      leaked,
      `${leaked.join(", ")} changes something and would be callable with a ` +
        `read-only token, which is the one promise that token makes.`,
    ).toEqual([]);
  });

  it("still answers the questions the endpoint exists for", () => {
    const names = READ_ONLY_TOOLS.map((t) => t.name);
    for (const n of ["list_clients", "get_client_overview", "list_audit_issues", "compare_search_periods"]) {
      expect(names, n).toContain(n);
    }
  });

  it("matches the tool count the README advertises", () => {
    // The README said 22 while the list held 23: #51 added a tool and
    // updated docs/mcp-server.md but not the headline number. Rule four
    // of this codebase is never a second hardcoded copy of something
    // that already exists — and where one has to exist, test it.
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const claimed = readme.match(/\*\*(\d+) tools\*\*/);
    if (!claimed) {
      throw new Error(
        "README no longer states a '**N tools**' count. If that is " +
          "deliberate, delete this test; do not leave it passing vacuously.",
      );
    }
    expect(Number(claimed[1]), "README tool count is stale").toBe(
      MCP_TOOL_LIST.length,
    );
  });

  it("can read tasks and the queue, but not change a task", () => {
    const names = READ_ONLY_TOOLS.map((t) => t.name);
    for (const n of ["list_tasks", "get_task", "list_publish_queue", "get_queue_item"]) {
      expect(names, n).toContain(n);
    }
    expect(names).not.toContain("update_task");
  });

  it("is smaller than the full list, and not empty", () => {
    // Guards the guard: an empty list would pass the exclusion test, and
    // a list equal to the full one would mean the filter does nothing.
    expect(READ_ONLY_TOOLS.length).toBeGreaterThan(0);
    expect(READ_ONLY_TOOLS.length).toBeLessThan(MCP_TOOL_LIST.length);
    expect(MCP_TOOL_LIST.length - READ_ONLY_TOOLS.length).toBe(WRITERS.size);
  });
});
