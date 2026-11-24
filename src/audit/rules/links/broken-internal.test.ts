import { beforeEach, describe, expect, it, vi } from "vitest";

const statuses: Record<string, number> = {};
vi.mock("@/audit/crawler/fetcher", () => ({
  fetchUrl: async (url: string) => statuses[url] ?? 200,
}));

const { brokenInternalRule } = await import("./broken-internal");

const PAGE = "https://example.com/";
const ctx = (hrefs: string[]) =>
  ({
    url: PAGE,
    links: hrefs.map((href) => ({ href, isInternal: true })),
  }) as unknown as Parameters<typeof brokenInternalRule.run>[0];

describe("links-broken-internal", () => {
  beforeEach(() => {
    for (const k of Object.keys(statuses)) delete statuses[k];
  });

  it("does not call a link broken when the site slows us down (429, 503)", async () => {
    statuses[`${PAGE}a`] = 503;
    statuses[`${PAGE}b`] = 429;
    const r = await brokenInternalRule.run(ctx([`${PAGE}a`, `${PAGE}b`, `${PAGE}c`]));
    expect(r.status).toBe("warn");
    expect(r.details).toMatchObject({ uncheckedCount: 2 });
    expect(r.details).not.toHaveProperty("brokenCount");
  });

  it("still reports 404, 410 and other server errors as broken", async () => {
    statuses[`${PAGE}a`] = 404;
    statuses[`${PAGE}b`] = 410;
    statuses[`${PAGE}c`] = 500;
    statuses[`${PAGE}d`] = 503;
    const r = await brokenInternalRule.run(ctx([`${PAGE}a`, `${PAGE}b`, `${PAGE}c`, `${PAGE}d`]));
    expect(r.status).toBe("fail");
    expect(r.details).toMatchObject({ brokenCount: 3, uncheckedCount: 1 });
  });
});
