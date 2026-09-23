import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { KNOWN_FREE_PAGE_ROUTES } from "./tool-capabilities";
import { toolReadiness } from "./tool-readiness";

/**
 * The readiness dot, locked down.
 *
 * The dot shipped three times before it worked: too small to see, then
 * visible but claiming MCP made AI pages run, then correct in the
 * sidebar and wrong in the per-client rail because the rule had been
 * written twice. Each of those was invisible to a passing test suite —
 * the markup was there every time.
 *
 * These tests cover the claims a dot makes, not whether it renders.
 */

describe("green means it actually works", () => {
  it("a free tool is ready with no key at all", () => {
    // /tools/robots is derived free — it never reaches a spend module.
    const r = toolReadiness({ href: "/tools/robots", hasAiKey: false });
    expect(r.state).toBe("ready");
  });

  it("query strings and hashes don't change the answer", () => {
    // The rail links with ?url= and ?clientId= on nearly every entry, so
    // a lookup that didn't strip them would fall through to "unknown"
    // and silently drop the dot from the one panel that most needs it.
    const plain = toolReadiness({ href: "/tools/robots", hasAiKey: false });
    const withQuery = toolReadiness({
      href: "/tools/robots?url=https%3A%2F%2Fexample.com#top",
      hasAiKey: false,
    });
    expect(withQuery).toEqual(plain);
  });
});

describe("amber means something specific is missing", () => {
  it("an AI tool with no key is blocked, and says where to fix it", () => {
    const r = toolReadiness({ href: "/seo-chat", hasAiKey: false });
    expect(r.state).toBe("blocked");
    if (r.state !== "blocked") return;
    expect(r.label).toMatch(/AI key/i);
    expect(r.fixHref).toBe("/settings#ai");
  });

  it("the same tool turns green once a key exists", () => {
    expect(toolReadiness({ href: "/seo-chat", hasAiKey: true }).state).toBe(
      "ready",
    );
  });

  it("an unconnected integration outranks having a key", () => {
    // A key doesn't help a tool that has no Search Console data to read.
    const r = toolReadiness({
      href: "/tools/traffic-drop?clientId=1",
      needs: "gsc",
      hasAiKey: true,
    });
    expect(r.state).toBe("blocked");
    if (r.state !== "blocked") return;
    expect(r.fixHref).toBe("/settings/google");
  });
});

describe("silence where we don't know", () => {
  it("a genuinely mixed page gets no dot rather than a wrong one", () => {
    // /reports both works without a key (crawl data, PDF) and offers an
    // AI executive summary, so neither colour is true. Green would
    // oversell it and amber would say a working page is broken — the
    // exact failure this codebase keeps producing: a confident wrong
    // answer instead of a crash.
    const r = toolReadiness({ href: "/reports", hasAiKey: false });
    expect(r.state).toBe("unknown");
  });

  it("an unknown route gets no dot", () => {
    expect(
      toolReadiness({ href: "/not-a-real-route", hasAiKey: false }).state,
    ).toBe("unknown");
  });
});

describe("a connected chat subscription is not a key", () => {
  it("nothing in the rule can be satisfied by MCP", () => {
    // The signature takes hasAiKey and nothing else, deliberately. The
    // bug this replaces was worksIn() returning true for mode "mcp",
    // which put "all 96 tools work" on screen while the AI pages
    // answered "No active AI provider". MCP runs the other way round:
    // the chat app calls into this one, so these pages still have
    // nothing to call.
    const src = readFileSync(join(process.cwd(), "src/lib/tool-readiness.ts"), "utf8");
    expect(src).not.toMatch(/hasSubscription|mode === "mcp"|"both"/);
  });
});

describe("one rule, not one per panel", () => {
  /**
   * The regression that prompted this file: the sidebar and the launcher
   * each had their own copy, they disagreed about the uncertain case,
   * and the same tool showed a green dot in one panel and none in the
   * other. CLAUDE.md's fourth standing rule, applied to a rule rather
   * than a list.
   */
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  }

  it("no panel re-derives readiness from capability flags", () => {
    const allowed = new Set(
      ["src/lib/tool-readiness.ts", "src/lib/tool-capabilities.ts"].map((p) =>
        join(process.cwd(), p),
      ),
    );
    const offenders = walk(join(process.cwd(), "src"))
      .filter((f) => !allowed.has(f))
      .filter((f) => /isKnownAiPage/.test(readFileSync(f, "utf8")));

    expect(
      offenders.map((f) => f.replace(process.cwd(), "")),
      `These files decide readiness themselves instead of calling ` +
        `toolReadiness(). That is how the sidebar and the client rail ` +
        `came to disagree about the same tool.`,
    ).toEqual([]);
  });
});

describe("per-client views resolve like the page they came from", () => {
  /**
   * The rail links "/content/c/4"; the generated table stores
   * "/content/c/[clientId]". Exact-map lookup missed every one of them,
   * so 13 of 43 rail entries — a third of the panel — drew no dot while
   * the identical tool reached from the sidebar drew one. Nothing
   * errored; the dot was simply absent, which reads as the feature being
   * broken rather than as the app being unsure.
   */
  it("a client-scoped AI page is blocked without a key, like its parent", () => {
    expect(
      toolReadiness({ href: "/ai-visibility/c/4", hasAiKey: false }).state,
    ).toBe("blocked");
    expect(toolReadiness({ href: "/ai-visibility", hasAiKey: false }).state).toBe(
      "blocked",
    );
  });

  it("a client-scoped tool page resolves the same as /tools/<name>", () => {
    expect(
      toolReadiness({ href: "/ai-visibility/c/4", hasAiKey: false }).state,
    ).toBe("blocked");
    expect(toolReadiness({ href: "/ai-visibility/c/4", hasAiKey: true }).state).toBe(
      "ready",
    );
  });

  it("a client id in the path never turns a real route into an unknown one", () => {
    // The failure mode, stated directly: same tool, two entry points,
    // two different answers.
    for (const [nested, parent] of [
      ["/ai-visibility/c/4", "/ai-visibility"],
      ["/agent/c/4", "/agent"],
    ]) {
      expect(
        toolReadiness({ href: nested, hasAiKey: false }).state,
        `${nested} should answer the same as ${parent}`,
      ).toBe(toolReadiness({ href: parent, hasAiKey: false }).state);
    }
  });
});

describe("the hand-verified free list stays true", () => {
  /**
   * KNOWN_FREE_PAGES is a claim about code, so it gets checked against
   * the code rather than trusted. Nothing under these route folders may
   * import an AI module — the moment one does, the green dot on that
   * page becomes a lie, and a lie is the failure mode this codebase
   * keeps producing: nothing throws, the number is just wrong.
   *
   * If this fails, do NOT delete the assertion. Either the AI belongs
   * there (drop the route from KNOWN_FREE_PAGES so it goes back to
   * showing no dot) or it does not (move the AI out).
   */
  const AI_IMPORT = /from\s+["']@\/lib\/ai-[a-z-]+["']|from\s+["']\.\.?\/[^"']*ai-call["']/;

  function filesUnder(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out; // Route folder may legitimately not exist as a folder.
    }
    for (const name of entries) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) filesUnder(p, out);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  }

  for (const route of KNOWN_FREE_PAGE_ROUTES) {
    it(`${route} contains no AI call path`, () => {
      const dir = join(process.cwd(), "src/app", route.replace(/^\//, ""));
      const offenders = filesUnder(dir).filter((f) =>
        AI_IMPORT.test(readFileSync(f, "utf8")),
      );
      expect(
        offenders.map((f) => f.replace(process.cwd(), "")),
        `${route} is on the hand-verified "works without a key" list, ` +
          `so the app paints it green. These files call a model, which ` +
          `makes that green dot wrong.`,
      ).toEqual([]);
    });

    it(`${route} is actually ready with no key`, () => {
      expect(toolReadiness({ href: route.replace("[id]", "4"), hasAiKey: false }).state).toBe(
        "ready",
      );
    });
  }
});
