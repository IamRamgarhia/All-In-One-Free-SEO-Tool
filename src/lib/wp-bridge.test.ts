import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * The wire contract with the WordPress plugin.
 *
 * Four field names in this file disagreed with seo-tool-bridge.php, and
 * every one failed silently:
 *
 *   /ping            plugin sends `plugin_version`, we read `version`
 *   GET  /post/N/seo plugin sends `meta_description`, we read `metaDescription`
 *   POST /post/N/seo plugin reads `meta_description`, we sent `metaDescription`
 *   POST /post/N/schema  plugin reads `jsonld`, we sent `jsonLd`
 *
 * None of them threw. The ping one meant `hasPluginVersion(undefined,
 * "0.3.0")` was always false, so alt-text capability could never open on
 * a real site. The POST ones meant WordPress accepted the request,
 * changed nothing, and answered `{ok: true}` — a write that reported
 * success and did nothing, which is the failure mode this project has
 * decided it cares about most.
 *
 * The names are asserted here because TypeScript cannot check them: both
 * sides of a JSON boundary are `string` regardless of what they spell.
 * scripts/wp-bridge-check.ts covers the same ground against a running
 * fake, but needs a server, so this is the copy that runs on every push.
 */

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ clients: {} }));
vi.mock("./crypto", () => ({ decrypt: (v: string) => v }));

const {
  getPostSeo,
  insertInternalLinks,
  pingWpBridge,
  setAttachmentAlt,
  setPostSchema,
  setPostSeo,
} = await import("./wp-bridge");

const creds = { endpoint: "https://example.com/wp-json/seo-tool/v1", key: "k" };

let fetchMock: ReturnType<typeof vi.fn>;

/** Capture what we send; reply with what the plugin actually sends back. */
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function sentBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as { body?: string };
  return JSON.parse(init?.body ?? "{}");
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // The endpoint above is public, so the SSRF guard is not in play here.
  vi.stubEnv("SEO_ALLOW_PRIVATE_WP_ENDPOINT", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ping", () => {
  it("reads the version from `plugin_version`", async () => {
    respond({ ok: true, plugin_version: "0.3.0", wp_version: "6.7" });
    const r = await pingWpBridge(creds);
    expect(r.ok).toBe(true);
    // Undefined here is what silently disabled alt text on every site.
    expect(r.version).toBe("0.3.0");
  });
});

describe("reading a post's SEO fields", () => {
  it("maps snake_case off the wire", async () => {
    respond({
      ok: true,
      id: 101,
      title: "Hello world",
      meta_description: "An existing description.",
      permalink: "https://example.com/hello-world",
      status: "publish",
    });
    const r = await getPostSeo(creds, 101);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seo.title).toBe("Hello world");
    // Was undefined, which the agent read as "no description here" —
    // so it recorded null as the value to restore and undo would have
    // wiped a description that already existed.
    expect(r.seo.metaDescription).toBe("An existing description.");
    expect(r.seo.url).toBe("https://example.com/hello-world");
  });

  it("reports canonical and robots as unknown, since the plugin omits them", async () => {
    // Null means "we didn't ask", not "this page has no canonical".
    // Nothing may write a canonical based on this value.
    respond({ ok: true, id: 101, title: "t", meta_description: "" });
    const r = await getPostSeo(creds, 101);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seo.canonical).toBeNull();
    expect(r.seo.robots).toBeNull();
  });

  it("defaults a missing description to empty rather than undefined", async () => {
    respond({ ok: true, id: 101, title: "t" });
    const r = await getPostSeo(creds, 101);
    if (!r.ok) return;
    expect(r.seo.metaDescription).toBe("");
  });
});

describe("writing a post's SEO fields", () => {
  it("sends meta_description, not metaDescription", async () => {
    respond({ ok: true, changes: [{ field: "meta_description" }] });
    await setPostSeo(creds, 101, { metaDescription: "New description." });
    const body = sentBody();
    expect(body.meta_description).toBe("New description.");
    expect(body).not.toHaveProperty("metaDescription");
  });

  it("sends title unchanged", async () => {
    respond({ ok: true, changes: [] });
    await setPostSeo(creds, 101, { title: "New title" });
    expect(sentBody().title).toBe("New title");
  });

  it("refuses canonical rather than reporting a success it didn't get", async () => {
    // The plugin ignores this field and still answers ok, so the "apply
    // fix" button told users their site had been changed when it hadn't.
    const r = await setPostSeo(creds, 101, { canonical: "https://x.test/" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/can't write canonical/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses robots for the same reason", async () => {
    const r = await setPostSeo(creds, 101, { robots: "noindex" });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an empty patch instead of posting nothing", async () => {
    const r = await setPostSeo(creds, 101, {});
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("writing schema", () => {
  it("sends `jsonld`, all lowercase", async () => {
    respond({ ok: true, rev_id: 1 });
    await setPostSchema(creds, 101, '{"@type":"Article"}');
    const body = sentBody();
    // `jsonLd` made the plugin answer 400 "jsonld required", so every
    // schema write the agent could plan failed on a real site.
    expect(body.jsonld).toBe('{"@type":"Article"}');
    expect(body).not.toHaveProperty("jsonLd");
  });

  it("sends an empty value through, because that's how undo removes markup", async () => {
    // executor.ts records "" as the previous value for a schema write —
    // the only finding that triggers one is missing_schema, so the page
    // had none. revertAction replays that. If this were blocked client
    // side, or rejected by the plugin, the agent could add structured
    // data to a live page and never take it off.
    respond({ ok: true, rev_id: 9, removed: true });
    const r = await setPostSchema(creds, 101, "");
    expect(r.ok).toBe(true);
    expect(sentBody().jsonld).toBe("");
  });

  it("surfaces the plugin's rejection of invalid JSON", async () => {
    respond({ ok: false, error: "jsonld must be valid JSON" }, 400);
    const r = await setPostSchema(creds, 101, "{not json");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/valid JSON/i);
  });
});

describe("a 401 from the plugin", () => {
  it("points at the plugin version, not just at the key", async () => {
    // Bridge plugins before 0.4.0 read only `Authorization` while this
    // client only ever sent `X-STB-Key`, so every request 401'd no
    // matter how correct the key was. A bare "401" sends people to
    // re-copy a key that was never the problem.
    respond({ code: "rest_forbidden" }, 401);
    const r = await getPostSeo(creds, 101);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/0\.4\.0/);
    expect(r.error).toMatch(/update/i);
  });
});

describe("alt text", () => {
  it("sends `alt`", async () => {
    respond({ ok: true, rev_id: 3 });
    await setAttachmentAlt(creds, 201, "Soap bars on a shelf");
    expect(sentBody().alt).toBe("Soap bars on a shelf");
  });
});

describe("internal links", () => {
  it("treats 'nothing to change' as a result, not an error", async () => {
    // Every anchor already linked is a normal outcome. Reporting it as a
    // failure would train users to ignore the agent's failures.
    respond({
      ok: true,
      changed: false,
      inserted: [],
      skipped: [{ anchor: "pricing", reason: "already linked" }],
    });
    const r = await insertInternalLinks(creds, 101, [
      { anchor: "pricing", url: "/pricing" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(false);
    expect(r.skipped[0].reason).toBe("already linked");
  });

  it("turns a 404 into an update-your-plugin message", async () => {
    respond({ code: "rest_no_route" }, 404);
    const r = await insertInternalLinks(creds, 101, [
      { anchor: "pricing", url: "/pricing" },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/plugin/i);
  });
});

describe("SSRF guard", () => {
  it("blocks a private endpoint by default", async () => {
    const r = await getPostSeo(
      { endpoint: "http://169.254.169.254/wp-json/seo-tool/v1", key: "k" },
      1,
    );
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows one when the self-hoster has opted in", async () => {
    // WordPress in the same compose stack, or on the LAN, is a normal
    // setup for this product and was previously impossible to connect.
    vi.stubEnv("SEO_ALLOW_PRIVATE_WP_ENDPOINT", "1");
    respond({ ok: true, id: 1, title: "t", meta_description: "" });
    const r = await getPostSeo(
      { endpoint: "http://192.168.1.50/wp-json/seo-tool/v1", key: "k" },
      1,
    );
    expect(r.ok).toBe(true);
  });

  it("still refuses non-http protocols even when opted in", async () => {
    vi.stubEnv("SEO_ALLOW_PRIVATE_WP_ENDPOINT", "1");
    const r = await getPostSeo(
      { endpoint: "file:///etc/passwd", key: "k" },
      1,
    );
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
