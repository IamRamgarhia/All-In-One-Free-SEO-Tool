/**
 * The token guarding the edge fix feed.
 *
 * That endpoint is reachable from the public internet by construction —
 * Cloudflare has to be able to call it — and what it returns is the set
 * of rewrites applied to a live website. So the two things worth testing
 * are that it is closed by default and that comparing the token does not
 * leak it.
 */

import { describe, expect, it } from "vitest";
import { constantTimeEqual, generateEdgeToken } from "./edge-token";

describe("the token itself", () => {
  it("is long enough that guessing is not a strategy", () => {
    expect(generateEdgeToken().length).toBeGreaterThanOrEqual(40);
  });

  it("is different every time", () => {
    // Guards against a constant sneaking in. A fixed token would work
    // perfectly in every test and be the same on every install.
    const seen = new Set(Array.from({ length: 20 }, generateEdgeToken));
    expect(seen.size).toBe(20);
  });

  it("is URL-safe, since it travels in a header and a config field", () => {
    expect(generateEdgeToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("comparing a candidate", () => {
  it("accepts the real token", () => {
    const t = generateEdgeToken();
    expect(constantTimeEqual(t, t)).toBe(true);
  });

  it("rejects a different token of the same length", () => {
    const a = generateEdgeToken();
    const b = generateEdgeToken();
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it("rejects a prefix without throwing", () => {
    // timingSafeEqual throws on a length mismatch. An uncaught throw
    // here would turn a wrong token into a 500 instead of a 401, and
    // the difference is itself a signal worth not giving away.
    const t = generateEdgeToken();
    expect(() => constantTimeEqual(t.slice(0, 10), t)).not.toThrow();
    expect(constantTimeEqual(t.slice(0, 10), t)).toBe(false);
  });

  it("rejects an empty candidate", () => {
    expect(constantTimeEqual("", generateEdgeToken())).toBe(false);
  });

  it("rejects a longer candidate that starts with the real token", () => {
    // The naive startsWith implementation would accept this.
    const t = generateEdgeToken();
    expect(constantTimeEqual(t + "extra", t)).toBe(false);
  });
});
