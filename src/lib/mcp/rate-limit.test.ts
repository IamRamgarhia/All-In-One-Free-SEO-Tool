/**
 * The per-token cap on the remote MCP endpoint.
 *
 * Time is passed in rather than waited for, so the window behaviour is
 * asserted rather than approximated.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { MCP_RATE_LIMIT, rateLimit, resetRateLimits } from "./rate-limit";

const opts = { requests: 3, windowMs: 1_000 };

beforeEach(() => resetRateLimits());

describe("the window", () => {
  it("allows exactly the quota, then refuses", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("a", { ...opts, now: 1_000 }).ok, `call ${i + 1}`).toBe(true);
    }
    expect(rateLimit("a", { ...opts, now: 1_000 }).ok).toBe(false);
  });

  it("says how long to wait, rounded up and never zero", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", { ...opts, now: 1_000 });
    const verdict = rateLimit("a", { ...opts, now: 1_100 });
    expect(verdict).toEqual({ ok: false, retryAfterSeconds: 1 });
  });

  it("lets the caller back in once the window has passed", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", { ...opts, now: 1_000 });
    expect(rateLimit("a", { ...opts, now: 1_999 }).ok).toBe(false);
    expect(rateLimit("a", { ...opts, now: 2_000 }).ok).toBe(true);
  });

  it("counts down what is left", () => {
    expect(rateLimit("a", { ...opts, now: 0 })).toEqual({ ok: true, remaining: 2 });
    expect(rateLimit("a", { ...opts, now: 10 })).toEqual({ ok: true, remaining: 1 });
  });
});

describe("keys", () => {
  it("does not let one token spend another's quota", () => {
    for (let i = 0; i < 3; i++) rateLimit("first", { ...opts, now: 1_000 });
    expect(rateLimit("first", { ...opts, now: 1_000 }).ok).toBe(false);
    expect(rateLimit("second", { ...opts, now: 1_000 }).ok).toBe(true);
  });
});

describe("the shipped limit", () => {
  it("is a sustained couple of requests a second, not a trickle", () => {
    // Low enough to bound abuse, high enough that a person working
    // through a chat never meets it.
    expect(MCP_RATE_LIMIT.requests).toBeGreaterThanOrEqual(60);
    expect(MCP_RATE_LIMIT.windowMs).toBe(60_000);
  });
});
