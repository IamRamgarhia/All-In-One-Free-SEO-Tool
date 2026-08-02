/**
 * A fake WordPress that speaks the SEO Tool Bridge protocol.
 *
 * Everything built in the last few commits — the plugin's three new
 * endpoints, the bridge client, per-image alt-text expansion, the
 * write/verify/undo paths — has never executed against anything. It has
 * been written carefully and reviewed, which this codebase has learned
 * the hard way is not the same as run. The portal shipped a sidebar, the
 * audit page invented a page count, four of my own checks passed on code
 * they never touched. All of it looked right.
 *
 * This closes the gap as far as it can be closed without a WordPress
 * install: it implements the endpoints exactly as the PHP is documented
 * to behave, so the agent's whole path can run end to end.
 *
 * What it proves: our client code, the expansion, the action model, the
 * verification read-back, and undo.
 * What it does NOT prove: that the PHP behaves as documented. That still
 * needs a real WordPress.
 *
 * IMPORTANT: the shapes below are copied from seo-tool-bridge.php, NOT
 * from what our client expects. That distinction found four bugs on the
 * first run — /ping sends `plugin_version` and we read `version`, the
 * SEO endpoint speaks `meta_description` and we sent `metaDescription`,
 * the schema endpoint reads `jsonld` and we sent `jsonLd`. Every one was
 * a silent no-op that reported success. If you change anything here,
 * change it to match the PHP.
 *
 *   node scripts/fake-wordpress.mjs [port]
 */

import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 8787);
const KEY = "fake-bridge-key";

const base = () => `http://localhost:${PORT}`;

/**
 * The initial site.
 *
 * Four pages, wired so that one of them — /cold-process-soap — is a
 * genuine orphan: it is in the sitemap and nothing links to it. That is
 * what an orphan actually is on a real site, and it's the case the
 * agent's internal-linking pass exists to fix.
 *
 * /hello-world is the page that should link to it: it's the closest in
 * topic, and it contains the phrase "cold process soap" in its body
 * text, so there is something to turn into a link.
 */
function initialPosts() {
  return new Map([
    [
      100,
      {
        id: 100,
        url: `${base()}/`,
        title: "Dice Soap Co",
        metaDescription: "Handmade soap from Yorkshire.",
        content:
          `<p>Welcome. Read our <a href="${base()}/hello-world">soap making notes</a> ` +
          `or the <a href="${base()}/about">about page</a>.</p>`,
        schema: "",
      },
    ],
    [
      101,
      {
        id: 101,
        url: `${base()}/hello-world`,
        title: "Hello world",
        metaDescription: "",
        content:
          "<p>Some words about handmade soap and cold process soap, which " +
          "takes six weeks to cure before it is ready to sell.</p>" +
          `<p>See also our <a href="${base()}/about">about page</a>.</p>`,
        schema: "",
      },
    ],
    [
      102,
      {
        id: 102,
        url: `${base()}/about`,
        title: "About us",
        metaDescription: "Who we are.",
        content:
          `<p>We have made soap since 2019. Read the <a href="${base()}/hello-world">notes</a>.</p>`,
        schema: "",
      },
    ],
    [
      103,
      {
        id: 103,
        url: `${base()}/cold-process-soap`,
        title: "Cold Process Soap Making",
        metaDescription: "How cold process soap is made.",
        // The orphan. In the sitemap, linked from nowhere.
        content: "<p>Cold process soap making, step by step.</p>",
        schema: "",
      },
    ],
  ]);
}

/** Mutable in-memory site. Reset per process, or via /reset. */
const state = {
  posts: initialPosts(),
  attachments: new Map([
    [201, { id: 201, src: "/uploads/soap-bars.jpg", alt: "" }],
    [202, { id: 202, src: "/uploads/lavender.jpg", alt: "Existing alt text" }],
  ]),
  revisions: [],
};

function record(field, object, oldV, newV) {
  // Monotonic from the highest id ever issued, matching the fixed
  // stb_record_revision. It used to be revisions.length + 1 here too —
  // the same bug, and it matters more now that undo is BY id.
  const highest = state.revisions.reduce((m, r) => Math.max(m, r.rev_id), 0);
  const rev_id = highest + 1;
  state.revisions.push({ rev_id, field, object, old: oldV, new: newV });
  return rev_id;
}

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // The public site. A real WordPress serves pages as well as the REST
  // API, and parts of the tool read the page directly rather than going
  // through the plugin — schema generation fetches the URL to work out
  // what kind of page it is. Served before the auth check, because a
  // visitor has no connection key.
  if (!url.pathname.startsWith("/seo-tool/v1")) {
    // A crawler that only follows links can never reach an orphan —
    // that's what makes it an orphan. Real sites expose them through
    // the sitemap, so this one does too.
    if (url.pathname === "/sitemap.xml") {
      const xml =
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        [...state.posts.values()]
          .map((p) => `  <url><loc>${p.url}</loc></url>`)
          .join("\n") +
        "\n</urlset>";
      res.writeHead(200, {
        "content-type": "application/xml",
        "content-length": Buffer.byteLength(xml),
      });
      res.end(xml);
      return;
    }
    if (url.pathname === "/robots.txt") {
      const txt = `User-agent: *\nAllow: /\nSitemap: ${base()}/sitemap.xml\n`;
      res.writeHead(200, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(txt),
      });
      res.end(txt);
      return;
    }

    const post = [...state.posts.values()].find(
      (p) => new URL(p.url).pathname === url.pathname,
    );
    if (!post) {
      res.writeHead(404, { "content-type": "text/html" }).end("<h1>Not found</h1>");
      return;
    }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${post.title}</title>
<meta name="description" content="${post.metaDescription}">
${post.schema ? `<script type="application/ld+json">${post.schema}</script>` : ""}
</head><body><article><h1>${post.title}</h1>
${post.content}
${[...state.attachments.values()].map((a) => `<img src="${a.src}" alt="${a.alt}" class="wp-image-${a.id}">`).join("\n")}
</article></body></html>`;
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": Buffer.byteLength(html),
    });
    res.end(html);
    return;
  }

  const path = url.pathname.replace(/^\/seo-tool\/v1/, "");

  // Authentication, copied from stb_check_key — which accepts EITHER
  // header, and as of 0.4.0 actually accepts the one the tool sends.
  //
  // This is the one place the fake was written from the client instead
  // of from the PHP, and it hid the worst bug in the plugin: the PHP
  // read only `Authorization`, the tool sent only `X-STB-Key`, so every
  // real request 401'd while 45 assertions here passed. Copy the PHP.
  const bearer = /^Bearer\s+/i.test(req.headers.authorization ?? "")
    ? (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim()
    : "";
  const custom = (req.headers["x-stb-key"] ?? "").trim();
  if (custom !== KEY && bearer !== KEY) {
    return json(res, 401, { ok: false, error: "bad key" });
  }

  if (path === "/ping") {
    return json(res, 200, {
      ok: true,
      plugin_version: "0.4.0",
      wp_version: "6.7",
      site_url: `http://localhost:${PORT}`,
      capabilities: {
        meta_titles: true,
        meta_descriptions: true,
        image_alt: true,
        schema: true,
        redirects: true,
      },
    });
  }

  let m;

  if ((m = path.match(/^\/post\/(\d+)\/seo$/))) {
    const post = state.posts.get(Number(m[1]));
    if (!post) return json(res, 404, { ok: false, error: "no such post" });
    if (req.method === "GET") {
      return json(res, 200, {
        ok: true,
        id: post.id,
        title: post.title,
        meta_description: post.metaDescription,
        permalink: post.url,
        status: "publish",
        modified: "2026-01-01 00:00:00",
      });
    }
    const body = await readBody(req);
    // The plugin only looks at these two keys. Anything else is ignored
    // and still answered `ok: true` — the behaviour that made "apply
    // canonical fix" a no-op that claimed success.
    const changes = [];
    if (typeof body.title === "string") {
      record("title", `post:${post.id}`, post.title, body.title);
      post.title = body.title;
      changes.push({ field: "title" });
    }
    if (typeof body.meta_description === "string") {
      record(
        "meta_description",
        `post:${post.id}`,
        post.metaDescription,
        body.meta_description,
      );
      post.metaDescription = body.meta_description;
      changes.push({ field: "meta_description" });
    }
    return json(res, 200, { ok: true, changes });
  }

  if ((m = path.match(/^\/post\/(\d+)\/images$/))) {
    const post = state.posts.get(Number(m[1]));
    if (!post) return json(res, 404, { ok: false, error: "no such post" });
    return json(res, 200, {
      ok: true,
      images: [...state.attachments.values()].map((a) => ({
        attachmentId: a.id,
        src: a.src,
        alt: a.alt,
        fixable: true,
      })),
    });
  }

  if ((m = path.match(/^\/attachment\/(\d+)\/alt$/))) {
    const att = state.attachments.get(Number(m[1]));
    if (!att) return json(res, 404, { ok: false, error: "no such attachment" });
    const body = await readBody(req);
    const next = String(body.alt ?? "");
    // The plugin records no revision when the value is unchanged, so an
    // undo can't be built from a write that did nothing.
    if (next === att.alt) {
      return json(res, 200, { ok: true, rev_id: null, note: "no change" });
    }
    const rev = record("alt", `attachment:${att.id}`, att.alt, next);
    att.alt = next;
    return json(res, 200, { ok: true, rev_id: rev });
  }

  if ((m = path.match(/^\/post\/(\d+)\/schema$/))) {
    const post = state.posts.get(Number(m[1]));
    if (!post) return json(res, 404, { ok: false, error: "no such post" });
    if (req.method === "GET") {
      return json(res, 200, { ok: true, managedJsonLd: post.schema });
    }
    const body = await readBody(req);
    const raw = String(body.jsonld ?? "");
    // Empty means remove, which is what undo replays — the tool records
    // "" as the previous value because the only finding that triggers a
    // schema write is "this page has none".
    if (raw === "") {
      if (post.schema === "") {
        return json(res, 200, { ok: true, rev_id: null, note: "no change" });
      }
      const rev = record("schema", `post:${post.id}`, post.schema, "");
      post.schema = "";
      return json(res, 200, { ok: true, rev_id: rev, removed: true });
    }
    let decoded;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return json(res, 400, { ok: false, error: "jsonld must be valid JSON" });
    }
    // The plugin stores wp_json_encode($decoded), not the raw string, so
    // what reads back is normalised rather than byte-identical to what
    // was sent. Callers must compare parsed values, not strings.
    const stored = JSON.stringify(decoded);
    const rev = record("schema", `post:${post.id}`, post.schema, stored);
    post.schema = stored;
    return json(res, 200, { ok: true, rev_id: rev });
  }

  if ((m = path.match(/^\/post\/(\d+)\/links$/))) {
    const post = state.posts.get(Number(m[1]));
    if (!post) return json(res, 404, { ok: false, error: "no such post" });
    const body = await readBody(req);
    if (!Array.isArray(body.links) || body.links.length === 0) {
      return json(res, 400, { ok: false, error: "links required" });
    }
    const links = body.links.slice(0, 10);
    const before = post.content;
    const inserted = [];
    const skipped = [];
    for (const l of links) {
      const anchor = String(l.anchor ?? "").trim();
      const href = String(l.url ?? "").trim();
      if (!anchor || !href) continue;
      const internal =
        (href.startsWith("/") && !href.startsWith("//")) ||
        href.startsWith(`http://localhost:${PORT}`);
      if (!internal) {
        skipped.push({ anchor, reason: "not an internal URL" });
        continue;
      }
      if (anchor.length < 3 || anchor.length > 80) {
        skipped.push({ anchor, reason: "anchor length" });
        continue;
      }
      if (post.content.includes(`>${anchor}<`)) {
        skipped.push({ anchor, reason: "already linked" });
        continue;
      }
      const idx = post.content.indexOf(anchor);
      if (idx < 0) {
        skipped.push({ anchor, reason: "anchor not found in visible text" });
        continue;
      }
      post.content =
        post.content.slice(0, idx) +
        `<a href="${href}">${anchor}</a>` +
        post.content.slice(idx + anchor.length);
      inserted.push({ anchor, url: href });
    }
    if (inserted.length === 0) {
      return json(res, 200, { ok: true, changed: false, inserted: [], skipped });
    }
    const rev = record("content", `post:${post.id}`, before, post.content);
    return json(res, 200, {
      ok: true,
      changed: true,
      inserted,
      skipped,
      rev_id: rev,
    });
  }

  if (path === "/find") {
    const target = url.searchParams.get("url") ?? "";
    // Exact path match, like url_to_postid. This used `includes`, which
    // was fine with one post and wrong the moment a homepage existed:
    // every path contains "/", so every lookup resolved to the
    // homepage, and the agent wrote every fix to the wrong page.
    let targetPath;
    try {
      targetPath = new URL(target).pathname.replace(/\/+$/, "") || "/";
    } catch {
      return json(res, 400, { error: "url required" });
    }
    for (const p of state.posts.values()) {
      const p1 = new URL(p.url).pathname.replace(/\/+$/, "") || "/";
      if (p1 === targetPath) return json(res, 200, { id: p.id });
    }
    return json(res, 404, { error: "not found" });
  }

  if (path === "/revisions") {
    return json(res, 200, { revisions: state.revisions });
  }

  // Not a plugin route. Restores the site to its starting state so a
  // test can run a second scenario without restarting the process —
  // restarting on the same port races with the OS releasing it, and a
  // new server that silently fails to bind leaves the OLD one answering,
  // which looks exactly like a passing test.
  if (path === "/reset") {
    state.posts = initialPosts();
    state.attachments.get(201).alt = "";
    state.attachments.get(202).alt = "Existing alt text";
    state.revisions.length = 0;
    return json(res, 200, { ok: true });
  }

  // Undo, mirroring stb_rest_undo. Nothing called this until internal
  // links, whose previous value is the whole article body — too big to
  // keep a copy of on our side, and already stored here.
  if ((m = path.match(/^\/undo\/(\d+)$/))) {
    const revId = Number(m[1]);
    const rev = state.revisions.find((r) => r.rev_id === revId);
    if (!rev) return json(res, 404, { ok: false, error: "Revision not found" });

    const bits = String(rev.object).split(":");
    if (bits.length !== 2 || !/^\d+$/.test(bits[1])) {
      return json(res, 422, {
        ok: false,
        error: "Revision refers to an object this plugin cannot identify",
      });
    }
    const objectId = Number(bits[1]);

    if (rev.field === "title") state.posts.get(objectId).title = rev.old;
    else if (rev.field === "meta_description")
      state.posts.get(objectId).metaDescription = rev.old;
    else if (rev.field === "alt") state.attachments.get(objectId).alt = rev.old;
    else if (rev.field === "schema") state.posts.get(objectId).schema = rev.old;
    else if (rev.field === "content") state.posts.get(objectId).content = rev.old;
    else return json(res, 400, { ok: false, error: "Unsupported field" });

    record(rev.field, rev.object, rev.new, rev.old);
    return json(res, 200, { ok: true, undone_rev_id: revId });
  }

  // A route the 0.2.1 plugin wouldn't have, used to prove the client's
  // "update your plugin" path.
  return json(res, 404, { ok: false, error: "no route" });
});

server.listen(PORT, () => {
  console.log(`fake WordPress bridge on http://localhost:${PORT}/seo-tool/v1`);
  console.log(`key: ${KEY}`);
});
