import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Engine } from "php-parser";

/**
 * The WordPress plugin, checked against the code that talks to it.
 *
 * This file exists because of the blast radius. The plugin runs inside
 * other people's live WordPress sites: a PHP parse error there is not a
 * failed test, it is a white screen on somebody's business. Nothing in
 * this repo could catch that — there is no PHP runtime on the machine
 * this is developed on, so the plugin was edited blind and shipped on
 * the assumption it was well-formed.
 *
 * Two guards:
 *
 *  1. It parses. A real PHP parser, not a brace count.
 *  2. Every endpoint the TypeScript client calls actually exists in the
 *     PHP. The bug that motivated this: `setPostSeo` accepted `canonical`
 *     and `robots` in its type, the handler read neither, and the plugin
 *     answered `{ok: true, changes: []}` — a write that reported success
 *     and changed nothing. Two "apply fix" buttons told users their site
 *     had been edited when it had not.
 */

const PLUGIN = join(process.cwd(), "wordpress-plugin/seo-tool-bridge.php");
const source = readFileSync(PLUGIN, "utf8");

function parse() {
  const engine = new Engine({
    parser: { extractDoc: false, suppressErrors: true },
    ast: { withPositions: true },
  });
  return engine.parseCode(source, "seo-tool-bridge.php");
}

describe("the plugin is valid PHP", () => {
  it("parses with no errors", () => {
    const ast = parse();
    const errors = (ast.errors ?? []) as { line?: number; message: string }[];
    expect(
      errors.map((e) => `line ${e.line}: ${e.message}`),
      "A parse error here is a white screen on every site running this " +
        "plugin. There is no PHP on the dev machine, so this test is the " +
        "only thing standing between an edit and somebody's live site.",
    ).toEqual([]);
  });

  it("defines every stb_ function it calls", () => {
    // Broader than the route check below, and the one that matters:
    // PHP resolves function names at call time, so a call to a function
    // that does not exist is a fatal error *only when that line runs*.
    // Adding a helper reference and forgetting the helper is invisible
    // until a user triggers that exact path on their live site. I did
    // exactly that while writing the site-level undo.
    const defined = new Set(
      [...source.matchAll(/^function\s+(stb_[a-z0-9_]+)\s*\(/gm)].map((m) => m[1]),
    );
    const called = new Set(
      [...source.matchAll(/\b(stb_[a-z0-9_]+)\s*\(/g)].map((m) => m[1]),
    );
    const missing = [...called].filter((c) => !defined.has(c));
    expect(
      missing,
      `${missing.join(", ")} is called but never defined. In PHP that is a ` +
        `fatal error on the request that reaches it — a 500 on somebody's ` +
        `live site, not a build failure here.`,
    ).toEqual([]);
  });

  it("defines every function its routes point at", () => {
    // register_rest_route takes callbacks by name. A typo in one is a
    // 500 on that endpoint only — invisible until someone uses it.
    const declared = new Set(
      [...source.matchAll(/^function\s+(stb_[a-z0-9_]+)\s*\(/gm)].map((m) => m[1]),
    );
    const referenced = [
      ...source.matchAll(/'(?:callback|permission_callback)'\s*=>\s*'([a-z0-9_]+)'/g),
    ].map((m) => m[1]);
    const missing = [...new Set(referenced)].filter((f) => !declared.has(f));
    expect(missing, `Routes point at ${missing.join(", ")}, which no function defines.`).toEqual([]);
  });
});

describe("the client and the plugin agree on what can be written", () => {
  /** Fields the SEO update handler actually reads out of the request body. */
  function handledSeoFields(): Set<string> {
    const start = source.indexOf("function stb_rest_update_post_seo");
    expect(start, "stb_rest_update_post_seo is gone or renamed").toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\nfunction ", start + 10));
    return new Set(
      [...body.matchAll(/isset\(\$body\['([a-z_]+)'\]\)/g)].map((m) => m[1]),
    );
  }

  it("handles every field setPostSeo can send", () => {
    // Wire names are snake_case. The client sending `metaDescription`
    // instead of `meta_description` is a bug that already shipped: the
    // isset() was false, nothing changed, and the response still said ok.
    const handled = handledSeoFields();
    for (const field of ["title", "meta_description", "canonical", "robots"]) {
      expect(
        handled.has(field),
        `The client can send "${field}" but the plugin's handler never ` +
          `reads it, so that write would silently do nothing and still ` +
          `answer {ok: true}.`,
      ).toBe(true);
    }
  });

  it("records a revision for every field it writes", () => {
    // Undo is the thing that makes applying a fix safe to offer. A field
    // written without stb_record_revision cannot be undone, and the UI
    // offers undo unconditionally.
    const start = source.indexOf("function stb_rest_update_post_seo");
    const body = source.slice(start, source.indexOf("\nfunction ", start + 10));
    const writes = [...body.matchAll(/isset\(\$body\['([a-z_]+)'\]\)/g)].map((m) => m[1]);
    const revisions = [...body.matchAll(/stb_record_revision\('([a-z_]+)'/g)].map((m) => m[1]);
    const unlogged = writes.filter((w) => !revisions.includes(w));
    expect(
      unlogged,
      `${unlogged.join(", ")} can be written but records no revision, so ` +
        `the undo button would have nothing to restore.`,
    ).toEqual([]);
  });
});

describe("the version the client requires is the version that ships", () => {
  it("STB_VERSION is at least every floor capabilities.ts gates on", () => {
    const shipped = source.match(/define\('STB_VERSION',\s*'([\d.]+)'\)/)?.[1];
    expect(shipped, "STB_VERSION is missing").toBeTruthy();

    const caps = readFileSync(
      join(process.cwd(), "src/lib/agent/capabilities.ts"),
      "utf8",
    );
    const floors = [
      ...caps.matchAll(/hasPluginVersion\([^,]+,\s*"([\d.]+)"\)/g),
    ].map((m) => m[1]);

    const cmp = (a: string, b: string) => {
      const pa = a.split(".").map(Number);
      const pb = b.split(".").map(Number);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
      }
      return 0;
    };

    const tooNew = floors.filter((f) => cmp(f, shipped!) > 0);
    expect(
      tooNew,
      `capabilities.ts requires plugin ${tooNew.join(", ")} but the plugin ` +
        `in this repo is ${shipped}. Every user would see those ` +
        `capabilities as permanently unavailable.`,
    ).toEqual([]);
  });
});
