/**
 * The sweep runs tools by id. Those ids must be real.
 *
 * SWEPT_TOOL_IDS is the second place a tool's slug is written down — the
 * first is its route directory — and CLAUDE.md's fourth rule exists
 * because every such pair in this codebase had already drifted by the
 * time anyone found it. A wrong id here does not throw: the sweep still
 * runs the imported function, but the "runs on its own" badge and the
 * finding's href point at a 404.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SWEPT_TOOL_IDS } from "./swept-tools";
import { sweptToolIds } from "./tool-sweep";

const TOOLS_DIR = path.resolve(__dirname, "../app/tools");

describe("swept tool ids", () => {
  it("names at least one tool", () => {
    // Guards the guard: an empty list passes every assertion below.
    expect(SWEPT_TOOL_IDS.length).toBeGreaterThan(0);
  });

  it("every id is a real tool route", () => {
    const missing = SWEPT_TOOL_IDS.filter(
      (id) => !existsSync(path.join(TOOLS_DIR, id, "page.tsx")),
    );
    expect(
      missing,
      `no /tools/<id>/page.tsx for: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("lists each tool once", () => {
    expect(new Set(SWEPT_TOOL_IDS).size).toBe(SWEPT_TOOL_IDS.length);
  });

  it("badges exactly what the sweep runs", () => {
    // Two modules, because the UI cannot import the one that opens the
    // database. If they disagree, either a tool runs nightly and nothing
    // says so, or — far worse — the rail promises a check that never
    // happens and the user stops doing it by hand.
    expect([...SWEPT_TOOL_IDS].sort()).toEqual(sweptToolIds().sort());
  });
});
