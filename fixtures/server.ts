/**
 * Serves the broken pages.
 *
 * A raw Node http server rather than a Next route, for two reasons.
 * Byte-level control is the whole point — status codes, an X-Robots-Tag
 * header, a deliberate delay, a malformed head — and none of this should
 * ship inside the app that users install.
 */

import { createServer, type Server } from "node:http";
import { FIXTURES } from "./pages";

export type RunningFixtures = {
  server: Server;
  /** e.g. http://127.0.0.1:53124 — no trailing slash. */
  baseUrl: string;
  close: () => Promise<void>;
};

/**
 * A whole-site scenario instead of the full fixture set.
 *
 * Site-level findings — no robots.txt, a malformed one, a crawl-delay —
 * need a site whose robots.txt is the thing under test, and the main set
 * needs a valid one for everything else to work. So they get their own
 * tiny site rather than another page in the big one.
 */
export type VariantConfig = {
  robots: string | null;
  sitemap: boolean;
};

/**
 * A one-page site that looks like a particular platform.
 *
 * The stack rules only run once the crawler has DETECTED the stack, and
 * detection re-fetches the URL and matches signatures in the HTML and
 * headers. So the signature has to be on the page the crawler is pointed
 * at, which means its own site rather than another fixture.
 */
export type StackConfig = {
  html: string;
  headers?: Record<string, string>;
};

/**
 * A correct, unremarkable page for the variant sites.
 *
 * Deliberately complete — a canonical, a description, headings, enough
 * prose — so the only thing a variant run reports is the site-level
 * finding it exists to check.
 */
function variantPage(path: string, host: string): string {
  const name = path === "/" ? "home" : "ordinary";
  const body = Array.from(
    { length: 4 },
    () =>
      "<p>An ordinary paragraph on an ordinary page, long enough that the " +
      "thin-content check has nothing to say about it, and dull enough that " +
      "nothing else does either. The point of this page is to exist and be " +
      "correct while the site around it is not.</p>",
  ).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The ${name} page of a robots.txt scenario</title>
<meta name="description" content="An ordinary page, used so a robots.txt scenario can be checked without anything else being wrong.">
<link rel="icon" href="/favicon.ico">
<link rel="canonical" href="http://${host}${path}">
<meta property="og:title" content="The ${name} page">
<meta property="og:description" content="An ordinary page.">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="The ${name} page">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"${name}"}</script>
</head>
<body>
<h1>The ${name} page</h1>
${body}
${path === "/" ? '<p><a href="/ordinary">The ordinary page</a></p>' : ""}
</body>
</html>`;
}

export async function startFixtureServer(
  variant?: VariantConfig,
  stack?: StackConfig,
): Promise<RunningFixtures> {
  const byPath = new Map(FIXTURES.map((f) => [f.path, f]));

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    // robots.txt and sitemap.xml are fetched by the crawler directly
    // rather than followed as links, so they are served here rather than
    // being fixtures. Both are deliberately present and valid: their
    // absence is its own finding, and a fixture site that is missing
    // them would trip that check on every single page.
    if (path === "/robots.txt") {
      if (variant) {
        if (variant.robots === null) {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("not found");
          return;
        }
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(variant.robots.replaceAll("HOST", String(req.headers.host)));
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(
        [
          "User-agent: *",
          "Allow: /",
          "",
          "User-agent: GPTBot",
          "Allow: /",
          "",
          `Sitemap: http://${req.headers.host}/sitemap.xml`,
          "",
        ].join("\n"),
      );
      return;
    }

    if (path === "/sitemap.xml") {
      if (variant && !variant.sitemap) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      // A variant site is two pages, so its sitemap lists two pages. The
      // full fixture set would drag every unrelated finding into a run
      // that is meant to check one thing about robots.txt.
      const paths = stack
        ? ["/"]
        : variant
          ? ["/", "/ordinary"]
          : FIXTURES.map((f) => f.path);
      const urls = paths.map(
        (pp) => `  <url><loc>http://${req.headers.host}${pp}</loc></url>`,
      ).join("\n");
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      );
      return;
    }

    // A real favicon and image, so those checks see a 200 rather than a
    // 404 that would show up as a broken link on every page.
    if (path === "/favicon.ico" || path === "/img.png") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      );
      return;
    }

    if (stack) {
      // Every path serves the same page. Checks that read the URL — an
      // author archive, /collections/all — need the crawl to START at
      // that path, and a 404 everywhere else would stop it.
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        ...(stack.headers ?? {}),
      });
      res.end(stack.html.replaceAll("HOST", String(req.headers.host)));
      return;
    }

    if (variant) {
      if (path === "/" || path === "/ordinary") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(variantPage(path, String(req.headers.host)));
        return;
      }
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<!doctype html><title>Not found</title><h1>Not found</h1>");
      return;
    }

    const fixture = byPath.get(path);
    if (!fixture) {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<!doctype html><title>Not found</title><h1>Not found</h1>");
      return;
    }

    const out = fixture.respond({ url: req.url ?? "/" });
    const send = () => {
      // The canonical fixtures need an absolute URL, and the port is only
      // known once the server is listening. HOST is substituted here.
      const body = out.body.replaceAll("HOST", String(req.headers.host));
      res.writeHead(out.status ?? 200, {
        "content-type": "text/html; charset=utf-8",
        ...(out.headers ?? {}),
      });
      res.end(body);
    };

    if (out.delayMs) setTimeout(send, out.delayMs);
    else send();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("fixture server did not bind a port");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
