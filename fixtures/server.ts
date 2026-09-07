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

export async function startFixtureServer(): Promise<RunningFixtures> {
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
      const urls = FIXTURES.map(
        (f) => `  <url><loc>http://${req.headers.host}${f.path}</loc></url>`,
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
