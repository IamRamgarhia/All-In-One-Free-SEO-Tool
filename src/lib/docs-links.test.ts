import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { docsUrlFor, DOCS_BASE, DOCS_PAGES } from "./docs-links";
import { TOOL_CAPABILITIES } from "./tool-capabilities.generated";

/**
 * The help button, and where it actually lands.
 *
 * Every screen has one; it is the only route from "I don't understand
 * this page" to an explanation, and nobody files a bug when it points
 * somewhere useless. Two ways it can be useless:
 *
 *   - the wrong page, which an e2e test already covers for five screens
 *   - the right page and the wrong place on it, which is what this
 *     covers. All ~92 tools live on one generated reference page, so a
 *     link to the page alone drops the reader at the top of a table of
 *     ninety-odd rows to find their own.
 *
 * The anchors come from toolsPage() in docs-site/reference.mjs, built
 * from the same routes. These tests check the two agree rather than
 * trusting that they do.
 */

const DIST = join(process.cwd(), "docs-site/dist/tools.html");

/** Tool routes, as the app's own generated capability table lists them. */
const TOOL_ROUTES = TOOL_CAPABILITIES.map((t) => t.route).filter((r) =>
  /^\/tools\/[a-z0-9-]+$/.test(r),
);

describe("docsUrlFor", () => {
  it("sends each tool to its own anchor, not just the page", () => {
    expect(TOOL_ROUTES.length).toBeGreaterThan(50);
    for (const route of TOOL_ROUTES) {
      const url = docsUrlFor(route);
      const slug = route.replace("/tools/", "");
      expect(url, `${route} should deep-link`).toBe(
        `${DOCS_BASE}tools.html#tool-${slug}`,
      );
    }
  });

  it("still sends the tools index to the page itself", () => {
    // No anchor here on purpose: /tools IS the list.
    expect(docsUrlFor("/tools")).toBe(`${DOCS_BASE}tools.html`);
  });

  it("leaves non-tool screens alone", () => {
    expect(docsUrlFor("/keywords")).toBe(`${DOCS_BASE}keywords.html`);
    expect(docsUrlFor("/agent/autopilot")).toBe(`${DOCS_BASE}agent.html#control`);
    expect(docsUrlFor("/settings/backup")).toBe(`${DOCS_BASE}backup.html`);
  });

  it("falls back to the front page for an unknown route", () => {
    // A screen nobody mapped must still go somewhere real.
    expect(docsUrlFor("/some/screen/nobody/mapped")).toBe(`${DOCS_BASE}index.html`);
    expect(docsUrlFor(null)).toBe(`${DOCS_BASE}index.html`);
    expect(docsUrlFor("")).toBe(`${DOCS_BASE}index.html`);
  });

  it("ignores a query string and a trailing slash", () => {
    expect(docsUrlFor("/tools/geo-swot/")).toBe(
      `${DOCS_BASE}tools.html#tool-geo-swot`,
    );
    expect(docsUrlFor("/tools/geo-swot?client=4")).toBe(
      `${DOCS_BASE}tools.html#tool-geo-swot`,
    );
  });

  it("never builds a double slash", () => {
    // DOCS_BASE is normalised to end in exactly one slash; a second one
    // from a page value would 404 on a static host.
    for (const page of Object.values(DOCS_PAGES)) {
      expect(`${DOCS_BASE}${page}`).not.toMatch(/[^:]\/\//);
    }
  });
});

describe("the anchors exist on the built docs page", () => {
  /**
   * Skipped rather than failed when dist/ is absent: a fresh clone has
   * not run the docs build, and a unit suite that demands a build
   * artefact is a unit suite people start skipping. CI builds the docs,
   * so it runs there.
   */
  const built = existsSync(DIST) ? readFileSync(DIST, "utf8") : null;

  it.runIf(built)("every tool help link resolves to a real anchor", () => {
    const anchors = new Set(
      [...built!.matchAll(/id="(tool-[a-z0-9-]+)"/g)].map((m) => m[1]),
    );
    const missing = TOOL_ROUTES.map((r) => docsUrlFor(r).split("#")[1]).filter(
      (hash) => !hash || !anchors.has(hash),
    );
    expect(
      missing,
      `these tools link to an anchor the docs page does not have, so the ` +
        `help button lands at the top of the table instead: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it.runIf(existsSync(join(process.cwd(), "docs-site/dist/mcp.html")))(
    "the MCP page states the real tool counts",
    async () => {
      /**
       * The same guard the README has, for the other place the number
       * is published. This page read "22 tools in total" and "15 of the
       * 22" long after the real figures were 29 and 21 — prose cannot
       * be trusted to track code, so content.mjs now counts them at
       * build time and this checks the output.
       */
      const { MCP_TOOL_LIST, READ_ONLY_TOOLS } = await import("./mcp/server");
      const raw = readFileSync(
        join(process.cwd(), "docs-site/dist/mcp.html"),
        "utf8",
      );
      // Collapsed, because where the generated HTML wraps a line is
      // incidental and asserting on it makes this fail for the wrong
      // reason — which it did on the first run.
      const html = raw.replace(/\s+/g, " ");
      expect(html).toContain(`${MCP_TOOL_LIST.length} tools`);
      expect(html).toContain(`${READ_ONLY_TOOLS.length} of the ${MCP_TOOL_LIST.length}`);
      // And one row per tool, each with an anchor of its own.
      const rows = [...raw.matchAll(/id="mcp-[a-z0-9-]+"/g)].length;
      expect(rows).toBe(MCP_TOOL_LIST.length);
    },
    // Not the default 5s. The `await import` above is the only reason
    // this test is slow and it is also the whole point of it — importing
    // the real module is what makes the assertion about the real tool
    // list rather than about a copy of it. That import pulls in the db
    // layer and its Drizzle schema, which costs a few seconds to
    // transform; alone it finishes in about 1s, and under a loaded full
    // suite it crossed 5s and failed the run. A timeout tuned to an idle
    // machine is a test that fails for a reason unrelated to the code.
    20_000,
  );

  it.runIf(built)("the docs page has no anchor for a tool that is gone", () => {
    // The other direction: a removed tool leaving a stale row is a
    // documented feature that no longer exists, which is worse than a
    // missing one.
    const anchors = [...built!.matchAll(/id="(tool-[a-z0-9-]+)"/g)].map((m) =>
      m[1].replace(/^tool-/, ""),
    );
    const routes = new Set(TOOL_ROUTES.map((r) => r.replace("/tools/", "")));
    const orphans = anchors.filter((a) => !routes.has(a));
    expect(orphans, `documented but not in the app: ${orphans.join(", ")}`).toEqual(
      [],
    );
  });
});
