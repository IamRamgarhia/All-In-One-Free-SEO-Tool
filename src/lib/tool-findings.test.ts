/**
 * The properties that decide whether a tool's findings are reachable.
 *
 * Every one of these fails silently. A row missing its client id saves
 * cleanly, renders correctly on the tool's own page, and is invisible to
 * the agent forever — which is how SXO shipped that way. A status that
 * does not carry looks like a finding legitimately re-appearing. None of
 * them throw, so none of them would be noticed without a test.
 *
 * `recordToolRun` itself talks to the database and so is not covered
 * here; `toFindingRows` is the part that holds the properties.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_FINDINGS_PER_RUN,
  pickOpenFindings,
  toFindingRows,
  type FindingRowForPicking,
  type CarriedStatus,
  type FindingDraft,
} from "./tool-findings";

const draft = (signature: string, over: Partial<FindingDraft> = {}): FindingDraft => ({
  signature,
  title: `Something about ${signature}`,
  severity: "medium",
  ...over,
});

describe("toFindingRows", () => {
  it("names the client on every row", () => {
    // The one that shipped wrong. loadActionableToolFindings filters on
    // this column, so a null here is a finding the agent can never see.
    const rows = toFindingRows({
      runId: 7,
      clientId: 42,
      toolId: "robots",
      drafts: [draft("a"), draft("b"), draft("c")],
    });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.clientId).toBe(42);
      expect(r.runId).toBe(7);
      expect(r.toolId).toBe("robots");
    }
  });

  it("keeps a null client null rather than inventing one", () => {
    // A tool run from the generic /tools page belongs to nobody. That is
    // correct, not a bug to paper over with a default id.
    const [row] = toFindingRows({
      runId: 1,
      clientId: null,
      toolId: "robots",
      drafts: [draft("a")],
    });
    expect(row.clientId).toBeNull();
  });

  it("defaults a finding nobody has ruled on to new", () => {
    const [row] = toFindingRows({
      runId: 1,
      clientId: 1,
      toolId: "robots",
      drafts: [draft("a")],
    });
    expect(row.status).toBe("new");
    expect(row.completedAt).toBeNull();
  });

  it("does not re-open what a person chose to ignore", () => {
    // Re-running a check is not new information about a decision. Losing
    // this means the agent plans work the site's owner has declined.
    const carried = new Map<string, CarriedStatus>([
      [
        "a",
        { status: "ignored", completedAt: null, completedNote: "fine for us" },
      ],
    ]);
    const [row] = toFindingRows({
      runId: 2,
      clientId: 1,
      toolId: "robots",
      drafts: [draft("a")],
      carried,
    });
    expect(row.status).toBe("ignored");
    expect(row.completedNote).toBe("fine for us");
  });

  it("does not re-open what was marked resolved", () => {
    const when = new Date("2026-08-01T00:00:00Z");
    const carried = new Map<string, CarriedStatus>([
      ["a", { status: "resolved", completedAt: when, completedNote: null }],
    ]);
    const [row] = toFindingRows({
      runId: 2,
      clientId: 1,
      toolId: "robots",
      drafts: [draft("a")],
      carried,
    });
    expect(row.status).toBe("resolved");
    expect(row.completedAt).toBe(when);
  });

  it("carries a decision only onto the signature it was made about", () => {
    const carried = new Map<string, CarriedStatus>([
      ["a", { status: "ignored", completedAt: null, completedNote: null }],
    ]);
    const rows = toFindingRows({
      runId: 2,
      clientId: 1,
      toolId: "robots",
      drafts: [draft("a"), draft("b")],
      carried,
    });
    expect(rows.map((r) => r.status)).toEqual(["ignored", "new"]);
  });

  it("caps a runaway tool", () => {
    // A bulk tool over a large sitemap can emit a finding per URL. The
    // symptom of no ceiling is a slow app, not an error anyone traces.
    const many = Array.from({ length: MAX_FINDINGS_PER_RUN + 250 }, (_, i) =>
      draft(`sig-${i}`),
    );
    const rows = toFindingRows({
      runId: 1,
      clientId: 1,
      toolId: "bulk-scan",
      drafts: many,
    });
    expect(rows).toHaveLength(MAX_FINDINGS_PER_RUN);
  });

  it("passes the optional columns through as null rather than undefined", () => {
    // Drizzle treats undefined as "leave unset", which on a re-insert
    // would silently keep a stale value instead of clearing it.
    const [row] = toFindingRows({
      runId: 1,
      clientId: 1,
      toolId: "robots",
      drafts: [draft("a")],
    });
    expect(row.category).toBeNull();
    expect(row.details).toBeNull();
    expect(row.fixSteps).toBeNull();
    expect(row.codeSnippet).toBeNull();
  });
});

describe("pickOpenFindings", () => {
  const row = (
    over: Partial<FindingRowForPicking> & { runId: number; toolId: string },
  ): FindingRowForPicking => ({
    id: 1,
    signature: "sig",
    title: "A finding",
    severity: "high",
    status: "new",
    ...over,
  });

  it("counts each problem once, not once per run", () => {
    // The failure this exists to stop: a weekly check reporting 52
    // problems a year in, which reads as a site getting worse.
    const rows = [
      row({ runId: 9, toolId: "robots", signature: "robots.missing" }),
      row({ runId: 8, toolId: "robots", signature: "robots.missing" }),
      row({ runId: 7, toolId: "robots", signature: "robots.missing" }),
    ];
    expect(pickOpenFindings(rows)).toHaveLength(1);
  });

  it("keeps the latest run of every tool, not just the latest run", () => {
    // Rows are ordered by run id across all tools, so a tool that has
    // not run recently still has a current answer — dropping it would
    // silently hide whole tools from the ranked list.
    const rows = [
      row({ runId: 9, toolId: "robots" }),
      row({ runId: 4, toolId: "ai-robots" }),
      row({ runId: 3, toolId: "ai-robots" }),
    ];
    expect(pickOpenFindings(rows).map((f) => f.toolId)).toEqual([
      "robots",
      "ai-robots",
    ]);
  });

  it("does not resurrect a finding someone closed", () => {
    const rows = [
      row({ runId: 9, toolId: "robots", signature: "a", status: "ignored" }),
      row({ runId: 9, toolId: "robots", signature: "b", status: "resolved" }),
      row({ runId: 9, toolId: "robots", signature: "c", status: "new" }),
    ];
    expect(pickOpenFindings(rows).map((f) => f.signature)).toEqual(["c"]);
  });

  it("does not treat a passing check as work", () => {
    const rows = [
      row({ runId: 9, toolId: "sxo", signature: "a", severity: "pass" }),
      row({ runId: 9, toolId: "sxo", signature: "b", severity: "low" }),
    ];
    expect(pickOpenFindings(rows).map((f) => f.signature)).toEqual(["b"]);
  });

  it("keeps every open finding from the run it does count", () => {
    const rows = [
      row({ runId: 9, toolId: "robots", signature: "a" }),
      row({ runId: 9, toolId: "robots", signature: "b" }),
    ];
    expect(pickOpenFindings(rows)).toHaveLength(2);
  });
});
