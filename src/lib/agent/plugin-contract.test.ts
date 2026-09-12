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
    for (const field of [
      "title",
      "meta_description",
      "canonical",
      "robots",
      // Advertised as social_meta in the capability map. A flag that is
      // true while the handler ignores the field is the exact bug this
      // file was written for — canonical and robots shipped that way.
      "og_title",
      "og_description",
      "og_image",
      "twitter_title",
      "twitter_description",
      "twitter_image",
    ]) {
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
  it("the plugin header version is at least every floor capabilities.ts gates on", () => {
    // The header, not the constant. STB_VERSION is derived from it now,
    // because the two were separate literals and had already drifted —
    // the header said 0.5.0 while the constant said 0.5.1, so WordPress
    // showed the site owner one version while /ping told the tool
    // another, and capability gating reads /ping.
    const shipped = source.match(/^\s*\*\s*Version:\s*([\d.]+)/m)?.[1];
    expect(shipped, "the plugin header has no Version").toBeTruthy();

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

describe("what the plugin says it can do matches what it registered", () => {
  /**
   * The /ping response advertises a `capabilities` map. Its own comment
   * says "anything added here must have a route above it" — and the
   * three routes added in 0.5.0 shipped with their flags still false,
   * so the plugin told every caller it could not write canonicals while
   * happily writing them.
   *
   * Nothing read the field yet, which is exactly why it drifted. A flag
   * nobody checks is a lie waiting to be believed.
   */
  function pingCapabilities(): Record<string, boolean> {
    const start = source.indexOf("'capabilities' => [");
    expect(start, "the ping response no longer advertises capabilities").toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("]", start));
    const out: Record<string, boolean> = {};
    for (const m of body.matchAll(/'([a-z_]+)'\s*=>\s*(true|false)/g)) {
      out[m[1]] = m[2] === "true";
    }
    return out;
  }

  /**
   * Capability name -> the handler that must be registered for it.
   *
   * Keyed on the handler function rather than the route pattern. The
   * route strings contain regex escapes ("(?P<id>\d+)") and comparing
   * them across two languages is a way to fail for reasons that have
   * nothing to do with the thing being checked — which it promptly did.
   * A handler name is a plain identifier and means the same on both
   * sides.
   */
  const NEEDS_HANDLER: Record<string, string> = {
    meta_titles: "stb_rest_update_post_seo",
    meta_descriptions: "stb_rest_update_post_seo",
    canonical: "stb_rest_update_post_seo",
    robots: "stb_rest_update_post_seo",
    // Open Graph and Twitter ride the same endpoint as the rest of the
    // per-post metadata, so they need no route of their own — but they
    // do need the handler to actually read the fields, which the test
    // below checks by name.
    social_meta: "stb_rest_update_post_seo",
    image_alt: "stb_rest_update_alt",
    schema: "stb_rest_set_schema",
    internal_links: "stb_rest_insert_links",
    create_posts: "stb_rest_create_post",
    redirects: "stb_rest_set_redirects",
    robots_txt: "stb_rest_set_robots_txt",
    hardening: "stb_rest_set_hardening",
  };

  /** Handlers actually wired to a route. */
  function registeredHandlers(): Set<string> {
    return new Set(
      [...source.matchAll(/'callback'\s*=>\s*'(stb_[a-z_]+)'/g)].map((m) => m[1]),
    );
  }

  it("every capability claimed true has a route behind it", () => {
    const caps = pingCapabilities();
    const lying = Object.entries(caps)
      .filter(([, on]) => on)
      .filter(([name]) => {
        const handler = NEEDS_HANDLER[name];
        return !handler || !registeredHandlers().has(handler);
      })
      .map(([name]) => name);
    expect(
      lying,
      `${lying.join(", ")} is advertised as available and no matching ` +
        `route is registered.`,
    ).toEqual([]);
  });

  it("every capability with a route is claimed, not left false", () => {
    // The direction that actually bit: routes added, flags forgotten.
    const caps = pingCapabilities();
    const registered = registeredHandlers();
    const understated = Object.entries(NEEDS_HANDLER)
      .filter(([name, handler]) => registered.has(handler) && caps[name] === false)
      .map(([name]) => name);
    expect(
      understated,
      `${understated.join(", ")} has a working route but /ping reports it ` +
        `as unavailable, so callers are told the plugin cannot do ` +
        `something it does.`,
    ).toEqual([]);
  });
});

/**
 * The plugins screen, which is the first thing anyone sees.
 *
 * The row read "Deactivate | Check this plugin" and nothing else, so the
 * only route to the connection key was knowing it lives under Tools.
 * Every plugin a site owner has installed puts its settings one click
 * from that row; leaving it out reads as unfinished software.
 */
describe("what the plugins screen shows", () => {
  it("adds a Settings link to the plugin row", () => {
    expect(source).toContain("plugin_action_links_");
    expect(source).toContain("tools.php?page=seo-tool-bridge");
  });

  it("links out to the project rather than nowhere", () => {
    expect(source).toContain("plugin_row_meta");
    expect(source).toMatch(/github\.com\/IamRamgarhia\/SEO-Tool/);
  });

  it("says when nothing has ever connected", () => {
    // An unfinished setup otherwise looks exactly like a working one:
    // the plugin sits there active and silent either way.
    expect(source).toContain("after_plugin_row_");
    expect(source).toContain("STB_OPTION_LAST_SEEN");
  });

  it("records proof of life on the request whose job that is", () => {
    // The banner above is only honest if something actually writes the
    // option. Asserted here because a banner that never clears is worse
    // than no banner.
    const ping = source.slice(source.indexOf("function stb_rest_ping"));
    expect(ping.slice(0, 600)).toContain("update_option(STB_OPTION_LAST_SEEN");
  });
});

describe("the version is written down once", () => {
  it("derives STB_VERSION from the header instead of repeating it", () => {
    // These were two literals and they drifted. The header has to stay a
    // literal because WordPress parses the file as text, so the header
    // wins and the constant is read from it.
    expect(source).not.toMatch(/define\('STB_VERSION',\s*'[\d.]+'\)/);
    expect(source).toContain("stb_read_header_version(__FILE__)");
  });

  it("fails closed when the header cannot be read", () => {
    // Returning a guess would open capability gates the plugin may not
    // support. "0" closes every one of them.
    const fn = source.slice(source.indexOf("function stb_read_header_version"));
    expect(fn.slice(0, 1200)).toMatch(/return ['"]0['"];/);
  });
});

/**
 * Every field the plugin can write, it can also take back.
 *
 * This has now shipped broken twice, both times the same way: a field
 * added to the writer without its mirror in the undo switch. Canonical
 * and robots went first — their case blocks still carry a comment saying
 * they were "added late, and only because the plugin was finally run".
 * Then the six Open Graph fields did exactly the same thing, and the
 * live round-trip found it inside a minute: the write landed on the
 * rendered page and the undo answered 400 "Unsupported field".
 *
 * Writing works and taking it back does not is the worse half to get
 * wrong, because the tool offers an undo button for it either way.
 */
describe("every written field can be undone", () => {
  /** Fields the SEO handler records a revision for. */
  function writtenFields(): string[] {
    const start = source.indexOf("function stb_rest_update_post_seo");
    const body = source.slice(start, source.indexOf("\nfunction ", start + 10));
    return [
      ...new Set(
        [...body.matchAll(/stb_record_revision\('([a-z_]+)'/g)].map((m) => m[1]),
      ),
    ];
  }

  /** Fields the undo switch has a case for. */
  function undoableFields(): Set<string> {
    const start = source.indexOf("Unsupported field");
    // The switch sits above the default arm, so search backwards from it.
    const region = source.slice(Math.max(0, start - 6000), start);
    return new Set(
      [...region.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]),
    );
  }

  it("has an undo case for every field the SEO handler writes", () => {
    const undoable = undoableFields();
    const orphaned = writtenFields().filter((f) => !undoable.has(f));
    expect(
      orphaned,
      `${orphaned.join(", ")} can be written but has no case in the undo ` +
        `switch, so it falls through to "Unsupported field" and answers 400. ` +
        `The tool shows an undo button for it regardless.`,
    ).toEqual([]);
  });

  it("still knows about the fields that broke this before", () => {
    // Guards the guard: an empty writtenFields() would pass the test
    // above while proving nothing.
    const undoable = undoableFields();
    for (const f of ["title", "meta_description", "canonical", "robots"]) {
      expect(undoable.has(f), `${f} lost its undo case`).toBe(true);
    }
  });
});
