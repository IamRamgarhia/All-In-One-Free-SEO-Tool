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
import { outcomeOf, sweptToolIds } from "./tool-sweep";

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

/**
 * Most swept checks are form actions, and a form action reports failure
 * by returning `{ ok: false }` rather than by throwing. The sweep only
 * caught throws, so it logged "ok" for a traffic-drop check that
 * returned an error and recorded nothing at all — a success report over
 * a no-op, which is the failure this whole file exists to prevent.
 */
describe("what counts as a check that ran", () => {
  it("a returned failure is a failure, with its reason kept", () => {
    expect(outcomeOf({ ok: false, error: "No Search Console connection" })).toEqual({
      ok: false,
      error: "No Search Console connection",
    });
  });

  it("still a failure when the tool gives no reason", () => {
    // Silently treating this as success is how the original bug read.
    expect(outcomeOf({ ok: false }).ok).toBe(false);
    expect(outcomeOf({ ok: false }).error).toBeTruthy();
  });

  it("a returned success is a success", () => {
    expect(outcomeOf({ ok: true, result: { findings: [] } })).toEqual({ ok: true });
  });

  it("takes a plain result at face value", () => {
    // Several checks return their own shape with no `ok` field at all.
    // Guessing about those would trade one wrong answer for another.
    for (const r of [{ chain: [] }, [1, 2, 3], "fine", 0, null, undefined]) {
      expect(outcomeOf(r), `${JSON.stringify(r) ?? "undefined"}`).toEqual({
        ok: true,
      });
    }
  });

  it("does not mistake a nested ok for the tool's own verdict", () => {
    // `{ result: { ok: false } }` is a tool that succeeded while
    // reporting something about the site. Only the top level is the
    // tool's verdict on itself.
    expect(outcomeOf({ result: { ok: false } })).toEqual({ ok: true });
  });
});
