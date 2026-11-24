import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A site that answers 429 (too many requests) or 503 is slowing us down,
 * not reporting a missing page. Seen on orlimmo.fr: four links in a row
 * answered 429 and the express audit listed them as broken in a sales
 * pitch. They must be left unchecked, never reported broken.
 */

let answers: Record<string, number[]> = {};
const asked: string[] = [];

vi.mock("./url-guard", () => ({
  guardUrl: vi.fn(),
  guardedFetch: vi.fn(async (url: string) => {
    asked.push(url);
    const queue = answers[url] ?? [200];
    const status = queue.length > 1 ? queue.shift()! : queue[0];
    return new Response(null, { status });
  }),
}));

const { checkBrokenLinks } = await import("./audit");
type Page = Parameters<typeof checkBrokenLinks>[0][number];

const ORIGIN = "https://example.com";
function page(links: string[]): Page {
  return {
    url: `${ORIGIN}/`,
    finalUrl: `${ORIGIN}/`,
    status: 200,
    html: `<html><body>${links.map((l) => `<a href="${l}">x</a>`).join("")}</body></html>`,
    headers: new Headers(),
    responseTimeMs: 10,
    redirectHops: 0,
  } as Page;
}

beforeEach(() => {
  answers = {};
  asked.length = 0;
});

describe("checkBrokenLinks and a site that throttles", () => {
  it("does not report a link that answered 429 twice, nor check the ones after it", async () => {
    answers = { [`${ORIGIN}/a`]: [429], [`${ORIGIN}/b`]: [404] };
    const findings = await checkBrokenLinks([page([`${ORIGIN}/a`, `${ORIGIN}/b`])], ORIGIN);
    expect(findings).toEqual([]);
    expect(asked).not.toContain(`${ORIGIN}/b`);
  });

  it("keeps the second answer when the site recovers after the wait", async () => {
    answers = { [`${ORIGIN}/a`]: [429, 200], [`${ORIGIN}/b`]: [404] };
    const findings = await checkBrokenLinks([page([`${ORIGIN}/a`, `${ORIGIN}/b`])], ORIGIN);
    expect(findings.map((f) => f.message)).toEqual([expect.stringContaining(`${ORIGIN}/b`)]);
  });

  it("treats 503 the same way", async () => {
    answers = { [`${ORIGIN}/a`]: [503] };
    expect(await checkBrokenLinks([page([`${ORIGIN}/a`])], ORIGIN)).toEqual([]);
  });

  it("still reports a real 404", async () => {
    answers = { [`${ORIGIN}/gone`]: [404] };
    const findings = await checkBrokenLinks([page([`${ORIGIN}/gone`])], ORIGIN);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("broken_link");
  });
});
