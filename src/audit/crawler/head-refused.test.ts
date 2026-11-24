import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A server that refuses HEAD (405 Method Not Allowed, 501) may serve the
 * page fine with GET. Seen on orlimmo.fr/vente: HEAD 405, GET 200, and
 * the express audit told a prospect the link was broken. The status the
 * audit keeps must be GET's.
 */

const calls: { url: string; method: string }[] = [];
let answers: Record<string, number> = {};

vi.mock("@/audit/crawler/net", () => ({
  auditFetch: vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: String(input), method });
    return new Response(method === "GET" ? "<html></html>" : null, {
      status: answers[method] ?? 200,
    });
  }),
}));

import { fetchUrlWithRedirects } from "./fetcher";

beforeEach(() => {
  calls.length = 0;
  answers = {};
});

describe("fetchUrlWithRedirects when HEAD is refused", () => {
  it("asks again with GET on 405 and keeps GET's status", async () => {
    answers = { HEAD: 405, GET: 200 };
    const r = await fetchUrlWithRedirects("https://example.com/vente");
    expect(r.statusCode).toBe(200);
    expect(calls.map((c) => c.method)).toEqual(["HEAD", "GET"]);
  });

  it("asks again with GET on 501", async () => {
    answers = { HEAD: 501, GET: 200 };
    const r = await fetchUrlWithRedirects("https://example.com/");
    expect(r.statusCode).toBe(200);
  });

  it("still reports a page that is broken for GET too", async () => {
    answers = { HEAD: 405, GET: 404 };
    const r = await fetchUrlWithRedirects("https://example.com/gone");
    expect(r.statusCode).toBe(404);
  });

  it("does not send a second request when HEAD works", async () => {
    answers = { HEAD: 404 };
    const r = await fetchUrlWithRedirects("https://example.com/gone");
    expect(r.statusCode).toBe(404);
    expect(calls).toHaveLength(1);
  });
});
