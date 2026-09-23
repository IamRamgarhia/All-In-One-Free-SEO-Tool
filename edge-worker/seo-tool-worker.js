/**
 * SEO Tool edge worker — applies fixes in the HTML, before it ships.
 *
 * WHAT THIS IS FOR
 *
 * Automatic fixes in the SEO Tool go through the WordPress plugin, so a
 * PHP site, a static site or a React app gets the finding and the
 * instructions and nothing else. This closes that gap for anything
 * behind Cloudflare, whatever it is built in.
 *
 * WHY NOT A JAVASCRIPT PIXEL
 *
 * The two paid tools that apply fixes to any site — Search Atlas OTTO
 * and Alli AI — both default to a script that rewrites the page in the
 * visitor's browser. It is easier to install and it has a flaw worth
 * naming: AI crawlers do not run JavaScript. Vercel and MERJ measured
 * over 500 million GPTBot fetches and found no evidence of execution;
 * ClaudeBot downloaded JS in roughly a quarter of requests and ran none
 * of it. A title applied that way is invisible to ChatGPT, Claude and
 * Perplexity.
 *
 * This rewrites the HTML as it streams out of the origin, so a crawler
 * that never executes anything still sees the change — it is in the
 * source by the time the response arrives.
 *
 * THE RULE THIS IS WRITTEN AROUND
 *
 * It sits in front of a live website. Every failure path serves the
 * origin response untouched. A worker that 500s because a fetch timed
 * out would take the whole site down to fix a meta description, which
 * is a catastrophically bad trade. There is no error path here that
 * does anything other than get out of the way.
 *
 * INSTALL
 *
 *   1. Cloudflare dashboard → Workers & Pages → Create → paste this.
 *   2. Settings → Variables, add:
 *        SEO_TOOL_URL    where your SEO Tool runs, e.g. https://seo.example.com
 *        SEO_TOOL_TOKEN  the edge token from Settings → Edge worker
 *        SEO_CLIENT_ID   the client id shown on the same screen
 *   3. Add a route for the site, e.g. example.com/*
 *
 * Verify with: curl -sI https://yoursite.com | grep x-seo-tool
 */

/** How long a fetched fix set is reused before refetching. */
const FIX_TTL_SECONDS = 300;

/**
 * How long to wait for the fix set before giving up and serving the
 * page unchanged. Deliberately short: a slow SEO Tool must never become
 * a slow website.
 */
const FIX_TIMEOUT_MS = 1500;

// Named, then exported: Cloudflare only needs the default export, but an
// anonymous object literal trips the lint rule and is harder to reason
// about when this file grows a second handler.
const worker = {
  async fetch(request, env, ctx) {
    const response = await fetch(request);

    // Only HTML gets rewritten. Images, scripts and JSON stream through
    // untouched, which is most of the traffic.
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;

    // A redirect or an error page has nothing worth fixing, and a
    // rewritten 404 is a 404 that looks like a real page.
    if (!response.ok) return response;

    let fixes = null;
    try {
      fixes = await getFixes(env, ctx);
    } catch {
      // Deliberately silent and deliberately total. See the header.
      return response;
    }
    if (!fixes) return response;

    const path = new URL(request.url).pathname + new URL(request.url).search;
    const page = fixes.pages[path] || fixes.pages[stripTrailingSlash(path)];
    if (!page) return response;

    const out = new HTMLRewriter();
    const applied = [];

    if (page.title) {
      out.on("head title", new TextSetter(page.title));
      applied.push("title");
    }
    if (page.meta_description) {
      out.on(
        'head meta[name="description"]',
        new AttrSetter("content", page.meta_description),
      );
      applied.push("description");
    }
    if (page.canonical) {
      out.on(
        'head link[rel="canonical"]',
        new AttrSetter("href", page.canonical),
      );
      applied.push("canonical");
    }
    if (page.og_title) {
      out.on(
        'head meta[property="og:title"]',
        new AttrSetter("content", page.og_title),
      );
      applied.push("og:title");
    }
    if (page.twitter_title) {
      out.on(
        'head meta[name="twitter:title"]',
        new AttrSetter("content", page.twitter_title),
      );
      applied.push("twitter:title");
    }

    const rewritten = out.transform(response);

    // A header naming what changed, because "is this thing working" must
    // be answerable with curl rather than by reading the page and
    // guessing. Also the one thing that makes a misconfigured worker
    // visible rather than silently inert.
    const headers = new Headers(rewritten.headers);
    headers.set("x-seo-tool", applied.length ? applied.join(",") : "none");
    return new Response(rewritten.body, {
      status: rewritten.status,
      statusText: rewritten.statusText,
      headers,
    });
  },
};

export default worker;

/** Replace the text inside an element, leaving its attributes alone. */
class TextSetter {
  constructor(value) {
    this.value = value;
    this.done = false;
  }
  element(el) {
    el.setInnerContent(this.value);
    this.done = true;
  }
}

/** Set one attribute on the first matching element. */
class AttrSetter {
  constructor(name, value) {
    this.name = name;
    this.value = value;
    this.done = false;
  }
  element(el) {
    // First match only. A page with two canonical tags is already broken
    // and rewriting both would hide that rather than fix it.
    if (this.done) return;
    el.setAttribute(this.name, this.value);
    this.done = true;
  }
}

function stripTrailingSlash(p) {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

/**
 * The fix set, from Cloudflare's cache when it is warm.
 *
 * Cached by URL in the worker cache rather than fetched per request:
 * without it, every page view on the site becomes a request to the SEO
 * Tool, which turns a self-hosted app on a small VPS into the site's
 * bottleneck.
 */
async function getFixes(env, ctx) {
  if (!env.SEO_TOOL_URL || !env.SEO_TOOL_TOKEN || !env.SEO_CLIENT_ID) {
    return null;
  }
  const url = `${env.SEO_TOOL_URL.replace(/\/+$/, "")}/api/edge/fixes?client=${encodeURIComponent(env.SEO_CLIENT_ID)}`;
  const key = new Request(url, { method: "GET" });
  const cache = caches.default;

  const hit = await cache.match(key);
  if (hit) return hit.json();

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FIX_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { authorization: `Bearer ${env.SEO_TOOL_TOKEN}` },
    });
    if (!res.ok) return null;
    const body = await res.text();

    const cacheable = new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": `max-age=${FIX_TTL_SECONDS}`,
      },
    });
    // waitUntil, so caching never delays the response to the visitor.
    ctx.waitUntil(cache.put(key, cacheable.clone()));
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}
