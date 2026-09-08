/**
 * Every hardening finding names a switch the plugin actually has.
 *
 * This is a three-way agreement — the finding types the crawler emits,
 * the keys the PHP plugin defines, and the TypeScript list the bridge
 * sends — and all three are written by hand in different files.
 *
 * A wrong key here fails in the quietest possible way. The plugin
 * ignores anything it does not recognise, so the POST returns ok, the
 * read-back says the switch is still off, and the agent reports a site
 * that refused a change it was never actually asked to make.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXABLE, HARDENING_FOR_FINDING } from "./planner";
import { HARDENING_KEYS } from "../wp-bridge";
import { isAuditFindingType } from "../audit-finding-types";

/** The keys the PHP actually switches on, read from the plugin source. */
function pluginHardeningKeys(): string[] {
  const src = readFileSync(
    path.resolve(__dirname, "../../../wordpress-plugin/seo-tool-bridge.php"),
    "utf8",
  );
  const fn = src.slice(src.indexOf("function stb_hardening_keys"));
  const body = fn.slice(0, fn.indexOf("}"));
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("hardening map", () => {
  it("covers a real set of keys", () => {
    expect(pluginHardeningKeys().length).toBeGreaterThan(0);
    expect(Object.keys(HARDENING_FOR_FINDING).length).toBeGreaterThan(0);
  });

  it("only names switches the plugin defines", () => {
    const real = new Set(pluginHardeningKeys());
    const bogus = Object.entries(HARDENING_FOR_FINDING)
      .filter(([, key]) => !real.has(key))
      .map(([finding, key]) => `${finding} -> ${key}`);
    expect(
      bogus,
      `the plugin has no such switch, so turning it on would silently do nothing:\n  ${bogus.join("\n  ")}`,
    ).toEqual([]);
  });

  it("agrees with the bridge's own list", () => {
    // Two hand-written lists of the same thing, one in PHP and one in
    // TypeScript. CLAUDE.md's fourth rule, and the reason for it.
    expect([...HARDENING_KEYS].sort()).toEqual(pluginHardeningKeys().sort());
  });

  it("maps only from real crawler findings", () => {
    const notReal = Object.keys(HARDENING_FOR_FINDING).filter(
      (t) => !isAuditFindingType(t),
    );
    expect(notReal, `not finding types the crawler emits: ${notReal}`).toEqual(
      [],
    );
  });

  it("plans every finding it maps", () => {
    // A map entry with no FIXABLE entry is a switch nothing ever flips.
    for (const finding of Object.keys(HARDENING_FOR_FINDING)) {
      expect(FIXABLE[finding], `${finding} is mapped but not planned`).toBeDefined();
      expect(FIXABLE[finding].kind).toBe("write_hardening");
    }
  });

  it("gives every planned hardening finding a switch", () => {
    // The other direction: a FIXABLE entry with no map entry produces an
    // action the executor cannot carry out.
    const unmapped = Object.entries(FIXABLE)
      .filter(([, spec]) => spec.kind === "write_hardening")
      .map(([finding]) => finding)
      .filter((finding) => !HARDENING_FOR_FINDING[finding]);
    expect(
      unmapped,
      `planned as hardening but named no switch: ${unmapped}`,
    ).toEqual([]);
  });

  it("never turns one switch on for two different findings", () => {
    // Two findings sharing a switch would dedup to one action, so the
    // second finding would never be closed.
    const keys = Object.values(HARDENING_FOR_FINDING);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
