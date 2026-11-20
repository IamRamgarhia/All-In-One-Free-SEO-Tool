/**
 * Guards the claims the connection screens make about which tools work.
 *
 * These screens are read at the moment someone decides what to set up,
 * and getting them wrong costs real money and real time: someone who
 * connects a chat subscription because a list implied their tool would
 * work finds out when the page refuses. So the failure mode to protect
 * against is not a crash — it is a confident, specific, wrong list.
 *
 * Three properties matter:
 *
 *   1. The lists are derived, not typed out, so they cannot go stale.
 *   2. The counts shown beside a list ARE that list's length.
 *   3. The three-group framing stays true — in particular that nothing
 *      works on MCP alone.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LISTED_TOOL_COUNT,
  NEEDS_KEY_COUNT,
  WORKS_ANYWAY_COUNT,
  groupByCategory,
  mcpOnlyTools,
  modeCoverage,
  shortfallOf,
  unavailableIn,
} from "./connection-coverage";
import {
  AI_TOOL_COUNT,
  TOOL_CAPABILITIES,
  aiUsageOf,
  worksIn,
} from "./tool-capabilities";
import { isRetired } from "./tool-categories";
import { internalTools } from "./tool-registry";

describe("the lists say something, and agree with their counts", () => {
  it("both groups are non-empty, so no screen renders an empty promise", () => {
    const { worksAnyway, needsKey } = modeCoverage();
    // A vacuous pass is the real risk: if the derivation broke and
    // returned nothing, every "no tool is missing" assertion below would
    // succeed against empty arrays.
    expect(worksAnyway.length).toBeGreaterThan(40);
    expect(needsKey.length).toBeGreaterThan(10);
  });

  it("the counts are the lengths of the lists they label", () => {
    const { worksAnyway, needsKey } = modeCoverage();
    expect(WORKS_ANYWAY_COUNT).toBe(worksAnyway.length);
    expect(NEEDS_KEY_COUNT).toBe(needsKey.length);
    expect(LISTED_TOOL_COUNT).toBe(worksAnyway.length + needsKey.length);
  });

  it("every tool has a real name, not a slug", () => {
    for (const t of [...modeCoverage().worksAnyway, ...modeCoverage().needsKey]) {
      expect(t.title.length, `${t.href} needs a readable title`).toBeGreaterThan(2);
      // A title that is just the slug back means copyOf() lost the card
      // and something substituted the route. The user would see
      // "geo-score" where the grid says "GEO composite score".
      //
      // Checked as "is not a route", not as "contains no slash":
      // "WordPress hack / malware scan" is a real title and a slash in
      // prose is fine.
      expect(t.title).not.toBe(t.href);
      expect(t.title.startsWith("/")).toBe(false);
      expect(t.title).not.toContain("/tools/");
    }
  });

  it("no tool appears in both groups, and none is missed", () => {
    const { worksAnyway, needsKey } = modeCoverage();
    const a = new Set(worksAnyway.map((t) => t.href));
    const b = new Set(needsKey.map((t) => t.href));
    for (const href of a) expect(b.has(href)).toBe(false);
    expect(a.size + b.size).toBe(LISTED_TOOL_COUNT);
  });
});

describe("the groups match worksIn(), which is what the grid uses", () => {
  it("everything in worksAnyway really runs with nothing connected", () => {
    // If this ever disagrees, the screen promises a tool that the grid
    // hides — the exact contradiction that makes a product feel broken.
    for (const t of modeCoverage().worksAnyway) {
      const cap = TOOL_CAPABILITIES.find((c) => c.route === t.href);
      expect(cap, `${t.href} is not in the generated table`).toBeTruthy();
      expect(worksIn(cap!, "none"), `${t.title} was listed as always-available`).toBe(
        true,
      );
    }
  });

  it("everything in needsKey really does not", () => {
    for (const t of modeCoverage().needsKey) {
      const cap = TOOL_CAPABILITIES.find((c) => c.route === t.href);
      expect(worksIn(cap!, "none"), `${t.title} was listed as needing a key`).toBe(
        false,
      );
      // And a key genuinely fixes it — otherwise the call to action is
      // wrong, not just the list.
      expect(worksIn(cap!, "api")).toBe(true);
    }
  });

  it("retired tools are left out of both lists", () => {
    for (const t of [...modeCoverage().worksAnyway, ...modeCoverage().needsKey]) {
      expect(isRetired(t.href), `${t.title} is retired and should not be listed`).toBe(
        false,
      );
    }
  });
});

describe("the one-way asymmetry the whole framing rests on", () => {
  it("nothing works on a chat subscription alone", () => {
    // The screens present three groups rather than two symmetric
    // columns, because a key is a superset of a subscription for this
    // app's own tools. If that stops being true, the framing is a lie
    // and the copy needs rewriting — so fail loudly here rather than
    // letting it pass as a comment.
    const mcpOnly = mcpOnlyTools();
    expect(
      mcpOnly.map((t) => t.title),
      "A tool now runs on MCP alone. ModePreview's three-group layout " +
        "assumes none does — it tells people a subscription cannot drive " +
        "any model-backed tool here. Rewrite that copy before adding this.",
    ).toEqual([]);
  });

  it("mcp and none leave exactly the same tools unavailable", () => {
    // Not an implementation detail — it is the single most
    // counter-intuitive fact about this product, and the reason the
    // earlier UI was wrong. A subscription changes nothing about which
    // pages in here run.
    expect(unavailableIn("mcp")).toEqual(unavailableIn("none"));
    expect(unavailableIn("api")).toEqual([]);
    expect(unavailableIn("both")).toEqual([]);
  });

  it("the shortfall sentence appears when something is missing, and not otherwise", () => {
    expect(shortfallOf("api")).toBeNull();
    expect(shortfallOf("both")).toBeNull();
    // The MCP wording has to carry the "other way round" explanation,
    // or someone reads it as a bug in their setup.
    //
    // Asserted non-null first, deliberately: toContain() on a null gives
    // "the given combination of arguments (null and string) is invalid",
    // which says nothing about what broke. Found by mutation-testing
    // this file — a guard whose failure message is unreadable costs the
    // next person the time it was meant to save.
    const mcp = shortfallOf("mcp");
    const none = shortfallOf("none");
    expect(mcp, "mcp must report a shortfall").not.toBeNull();
    expect(none, "none must report a shortfall").not.toBeNull();
    expect(mcp!).toContain("calls into this app");
    expect(none!).toContain("API key");
    expect(mcp!).toContain(String(NEEDS_KEY_COUNT));
  });
});

describe("NEEDS_KEY_COUNT is not AI_TOOL_COUNT, on purpose", () => {
  it("counts fewer tools than needsAI does, and the gap is explainable", () => {
    // AI_TOOL_COUNT counts "can reach a model", which includes the
    // optional and partial tools that run fine without one. The
    // connection screens used it to mean "what a key unlocks" and so
    // named five working tools as unavailable.
    //
    // This test exists to stop someone "simplifying" the two back into
    // one number.
    // The two now measure different POPULATIONS as well as different
    // questions, so a single arithmetic identity between them is no
    // longer the right assertion.
    //
    // This test first asserted
    //   AI_TOOL_COUNT - optional - partial - retiredRequired === NEEDS_KEY_COUNT
    // and that held while every tool lived under /tools/. It broke — 26
    // against 31 — the moment the ten orphaned top-level tools (/ask,
    // /content-gap, /image-audit, /landing-perf …) joined the registry,
    // because AI_TOOL_COUNT still counts only /tools/* while
    // NEEDS_KEY_COUNT counts what the grid actually renders. The code
    // was right and the test's arithmetic was stale, which is worth
    // recording: the identity was never the property, it was a proxy
    // for it.
    //
    // The property is: NEEDS_KEY_COUNT is exactly the registry tools
    // that do not run without a key. Derived from the same place the
    // count is, so it cannot drift from it again.
    const registrySet = internalTools()
      .filter((t) => !isRetired(t.href))
      .map((t) => TOOL_CAPABILITIES.find((c) => c.route === t.href))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    const needKey = registrySet.filter((c) => !worksIn(c, "none"));
    expect(needKey.length).toBe(NEEDS_KEY_COUNT);

    // And none of them is an `optional` or `partial` tool, which is the
    // specific over-count that made the screens name five working tools
    // as unavailable.
    for (const c of needKey) {
      expect(
        aiUsageOf(c),
        `${c.route} is counted as needing a key but its usage is not "required"`,
      ).toBe("required");
    }

    // AI_TOOL_COUNT remains the broader "can reach a model" figure over
    // /tools/* only. Asserted as different on purpose, so nobody
    // "simplifies" the two back into one number.
    expect(NEEDS_KEY_COUNT).not.toBe(AI_TOOL_COUNT);
  });
});

describe("grouping is stable enough to render", () => {
  it("groups preserve every tool exactly once", () => {
    const tools = modeCoverage().needsKey;
    const grouped = groupByCategory(tools);
    const flat = grouped.flatMap((g) => g.tools.map((t) => t.href));
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.length).toBe(tools.length);
  });

  it("no group is emitted empty", () => {
    for (const g of groupByCategory(modeCoverage().worksAnyway)) {
      expect(g.tools.length).toBeGreaterThan(0);
      expect(g.label.length).toBeGreaterThan(2);
    }
  });
});

describe("the screens use the derived counts, not the old ones", () => {
  const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  /**
   * Source with comments removed.
   *
   * Needed because the fix for each of these defects left a comment
   * explaining what the old wrong value was — so a plain text search
   * found the string it was asserting absent and failed on the
   * explanation of its own fix. Searching the code rather than the prose
   * is the only version of this check that means anything.
   *
   * Block comments go first, then whole-line `//`. Trailing `//` is left
   * alone deliberately: stripping it would also cut `https://` out of
   * string literals.
   */
  const code = (p: string) =>
    raw(p)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");

  it("neither connection screen still prints AI_TOOL_COUNT", () => {
    // These two files are where the wrong number was shown. A regression
    // here is invisible at runtime: the page renders, with a number that
    // is five too high.
    for (const p of [
      "src/app/settings/connection-mode.tsx",
      "src/app/settings/mode-preview.tsx",
    ]) {
      expect(code(p), `${p} is back to AI_TOOL_COUNT`).not.toContain(
        "AI_TOOL_COUNT",
      );
    }
  });

  it("the tools grid header is computed, not a hardcoded claim", () => {
    expect(code("src/app/tools/tools-grid.tsx")).not.toContain(
      "100+ SEO utilities",
    );
    expect(code("src/app/tools/tools-grid.tsx")).toContain("LISTED_TOOL_COUNT");
  });

  it("the README advertises the real number of tools", () => {
    /**
     * The number people decide on before they install anything.
     *
     * WHY THIS EXISTS: README.md said "92 dedicated tools" in five
     * places, the GitHub repo description said 99, CLAUDE.md said 94,
     * and the app's own /tools header — the only one computed — said
     * 96. Four published numbers for one list, none of them agreeing,
     * all of them written down by hand at different times.
     *
     * A reader who counts the cards and gets a different answer than
     * the README has no way to tell which other claim in it is also
     * stale, which is the real cost. So the prose is held to the
     * computed figure here rather than trusted to track it.
     */
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const claims = [...readme.matchAll(/(\d+)\s+dedicated tools/g)].map((m) =>
      Number(m[1]),
    );
    // A vacuous pass is the risk — if the wording changes, every
    // assertion below holds over an empty list and this guard quietly
    // stops guarding. Same reason release-notes.test.ts checks it found
    // notes files at all.
    expect(
      claims.length,
      "README no longer says '<N> dedicated tools'. If that phrasing is " +
        "gone on purpose, update this test; do not delete it, or the " +
        "next number to go in will be a guess again.",
    ).toBeGreaterThanOrEqual(3);
    for (const n of claims) {
      expect(n, `README says ${n} dedicated tools`).toBe(LISTED_TOOL_COUNT);
    }
    // And the documentation table that links to the generated reference.
    expect(readme, "the docs link still names a stale count").toContain(
      `All ${LISTED_TOOL_COUNT},`,
    );
  });

  it("the setup flow shows the breakdown, not only settings", () => {
    // /welcome sends people to /connect#ai, so a breakdown that lives
    // only in Settings is not in the path anyone actually walks.
    expect(code("src/app/connect/list.tsx")).toContain("ModePreview");
  });
});
