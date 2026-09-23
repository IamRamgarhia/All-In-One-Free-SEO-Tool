import { describe, expect, it } from "vitest";
import {
  classifyProviderError,
  noProviderFailure,
  noKeyFailure,
  monthlyCapFailure,
  NO_KEY_STATUS,
  NO_OLLAMA_URL_STATUS,
} from "./ai-error";

/**
 * The audit's finding was that every AI failure — no key, retired model,
 * spend cap, network blip — collapsed into the same `null`, and all 68
 * call sites rendered the same empty box. These assert the replacement
 * actually distinguishes them, because a wrong-but-confident error
 * message sends people to fix the wrong thing.
 */

describe("classifyProviderError", () => {
  it("names a retired model as the problem, not a generic bad request", () => {
    // The single most common real cause: a vendor retires a model id
    // that is still sitting in the user's settings.
    const f = classifyProviderError(
      404,
      "models/gemini-1.5-flash is not found for API version v1beta",
      { provider: "gemini", model: "gemini-1.5-flash" },
    );
    expect(f.reason).toBe("unknown_model");
    expect(f.message).toContain("gemini-1.5-flash");
    expect(f.fixHref).toBe("/settings#ai");
  });

  it("treats a 400 that mentions the model as a model problem", () => {
    // Some gateways return 400 rather than 404 for an unknown model.
    const f = classifyProviderError(400, "The model `foo` does not exist", {
      provider: "openai",
      model: "foo",
    });
    expect(f.reason).toBe("unknown_model");
  });

  it("separates rate-limited from out-of-quota", () => {
    // Both are 429 and the advice differs: one means wait, the other
    // means add billing or switch provider.
    expect(classifyProviderError(429, "rate limit reached").reason).toBe(
      "rate_limited",
    );
    expect(
      classifyProviderError(429, "You exceeded your current quota").reason,
    ).toBe("quota_exceeded");
  });

  it("flags a rejected key and points at settings", () => {
    for (const status of [401, 403]) {
      const f = classifyProviderError(status, "invalid api key", {
        provider: "groq",
      });
      expect(f.reason).toBe("bad_key");
      expect(f.fixHref).toBe("/settings#ai");
    }
  });

  it("calls a 5xx temporary rather than blaming the user", () => {
    const f = classifyProviderError(503, "service unavailable");
    expect(f.reason).toBe("provider_error");
    expect(f.message).toMatch(/temporary|try again/i);
  });

  it("recognises a too-long prompt", () => {
    const f = classifyProviderError(400, "maximum context length exceeded");
    expect(f.reason).toBe("bad_request");
    expect(f.message).toMatch(/too long/i);
  });

  it("maps the pre-request sentinels", () => {
    expect(classifyProviderError(NO_KEY_STATUS, "", { provider: "gemini" }).reason).toBe(
      "no_key",
    );
    expect(classifyProviderError(NO_OLLAMA_URL_STATUS, "").reason).toBe(
      "no_ollama_url",
    );
  });

  it("distinguishes timeout from a dead connection", () => {
    expect(classifyProviderError(0, "The operation timed out").reason).toBe(
      "timeout",
    );
    expect(classifyProviderError(0, "ECONNREFUSED").reason).toBe("network");
  });
});

describe("failure messages are actionable", () => {
  it("every failure carries a non-empty sentence", () => {
    const all = [
      noProviderFailure(),
      noKeyFailure("gemini"),
      monthlyCapFailure(5),
      classifyProviderError(500, "boom"),
      classifyProviderError(404, "no such model", { model: "x" }),
    ];
    for (const f of all) {
      expect(f.message.length, f.reason).toBeGreaterThan(20);
      // No bare error codes shown to a user.
      expect(f.message, f.reason).not.toMatch(/^\s*(null|undefined|\d+)\s*$/);
    }
  });

  it("the no-provider message names a free option", () => {
    // This is what a brand-new user sees. Telling them "no provider"
    // without saying a free one exists is a dead end — and until the
    // Ollama always-configured bug was fixed, they never saw this at
    // all; they got "couldn't reach ollama" instead.
    const f = noProviderFailure();
    expect(f.reason).toBe("no_provider");
    expect(f.message).toMatch(/free/i);
    expect(f.message).toMatch(/Gemini|Groq/);
    expect(f.fixHref).toBe("/settings#ai");
  });

  it("the cap message says what the cap was", () => {
    expect(monthlyCapFailure(12.5).message).toContain("$12.50");
  });
});

/**
 * Every AI tool now shows the real reason instead of a fixed sentence.
 *
 * The classification below was already right. Thirteen call sites threw
 * it away and printed "AI provider didn't respond. Set up an API key in
 * Settings." When a real Gemini key hit its free-tier quota, every one
 * of those tools told the user to set up a key they already had — the
 * one instruction guaranteed not to help.
 *
 * These assert the classifier says the useful thing for the two failures
 * that actually happen in practice, so the message those call sites now
 * surface is worth surfacing.
 */
describe("what the user is told to do about it", () => {
  it("names the quota, not the key, when the quota is gone", () => {
    const f = classifyProviderError(429, '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}', { provider: "gemini" });
    expect(f.reason).toBe("quota_exceeded");
    expect(f.message).toMatch(/quota/i);
    // The instruction that sent people in circles.
    expect(f.message).not.toMatch(/set up (an )?(api )?key/i);
  });

  it("says wait, not reconfigure, when merely rate limited", () => {
    // Same status code, different cause. Telling someone to add billing
    // because they went too fast is its own kind of wrong answer.
    const f = classifyProviderError(429, '{"error":{"message":"Too many requests, please retry"}}', { provider: "gemini" });
    expect(f.reason).toBe("rate_limited");
    expect(f.message).toMatch(/wait|moment|again/i);
    expect(f.message).not.toMatch(/billing/i);
  });

  it("still tells someone with no key to add one", () => {
    // The fallback has to keep working, or this trade makes things worse
    // for the case it was originally written for.
    const f = classifyProviderError(401, "", { provider: "gemini" });
    expect(["bad_key", "no_key"]).toContain(f.reason);
  });
});
