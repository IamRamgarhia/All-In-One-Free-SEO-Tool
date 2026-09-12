/**
 * The Gemini request body, which is not the same for every model.
 *
 * Two bugs in one afternoon, both from assuming otherwise.
 *
 * First, thinking was left on. gemini-2.5-flash reasons before answering
 * and those tokens come out of maxOutputTokens, so a 600-token budget
 * for a short JSON summary was spent thinking and the answer arrived cut
 * off at 87 characters with no closing brace. Every caller's parser then
 * said "AI returned an unexpected format", blaming the model for a
 * budget the caller set. Turning it off took the tool sweep from 7
 * passing to 14.
 *
 * Then thinkingConfig was sent to every model, with a comment claiming
 * models that do not think ignore it. They do not:
 * gemini-flash-lite-latest answers 400 INVALID_ARGUMENT. So the fix
 * broke the fallback added beside it, and the chain went dead at the one
 * moment it was needed — when the primary model's quota ran out.
 *
 * Verified against the live API both ways before this was written.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { callGemini } from "./gemini";

type Captured = { url: string; body: Record<string, unknown> };

/** Answer every model with a fixed reply, and record what was sent. */
function capture(): { calls: Captured[] } {
  const calls: Captured[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }],
      }),
    } as unknown as Response;
  });
  return { calls };
}

const base = {
  apiKey: "k",
  system: "",
  messages: [{ role: "user" as const, content: "hi" }],
  maxTokens: 100,
  temperature: 0,
  timeoutMs: 5000,
};

const cfg = (c: Captured) =>
  (c.body.generationConfig ?? {}) as Record<string, unknown>;

afterEach(() => vi.unstubAllGlobals());

describe("thinking is off where it is supported", () => {
  it("sends thinkingConfig to 2.5 flash", async () => {
    const { calls } = capture();
    await callGemini({ ...base, model: "gemini-2.5-flash" });
    expect(cfg(calls[0]).thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("sends it to the unversioned flash alias", async () => {
    const { calls } = capture();
    await callGemini({ ...base, model: "gemini-flash-latest" });
    expect(cfg(calls[0]).thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
});

describe("and is omitted where it is refused", () => {
  it("does not send it to the lite alias", async () => {
    // The live API answers 400 INVALID_ARGUMENT for this combination.
    // Sending it killed the fallback chain silently.
    const { calls } = capture();
    await callGemini({ ...base, model: "gemini-flash-lite-latest" });
    expect(cfg(calls[0])).not.toHaveProperty("thinkingConfig");
  });

  it("omits it for any model nobody has tested", async () => {
    // Opt in by name, not out. An unknown model gets the request that is
    // known to work everywhere, so adding one cannot break the chain the
    // way this already did once.
    const { calls } = capture();
    await callGemini({ ...base, model: "some-future-model" });
    expect(cfg(calls[0])).not.toHaveProperty("thinkingConfig");
  });

  it("decides per model within a single fallback run", async () => {
    // The body used to be built once, outside the loop, which is how one
    // model's requirements ended up on every request.
    const calls: Captured[] = [];
    let n = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      // Fail the first model so the chain moves on to the next.
      if (n++ === 0) {
        return { ok: false, status: 429, text: async () => "quota" } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }],
        }),
      } as unknown as Response;
    });

    await callGemini({ ...base, model: "gemini-2.5-flash" });
    expect(calls.length).toBeGreaterThan(1);
    expect(cfg(calls[0]).thinkingConfig).toEqual({ thinkingBudget: 0 });
    const lite = calls.find((c) => c.url.includes("lite"));
    if (lite) expect(cfg(lite)).not.toHaveProperty("thinkingConfig");
  });
});

describe("a truncated answer is not returned as an answer", () => {
  it("moves on rather than handing back half a reply", async () => {
    // Half a summary reads as a real one to anyone skimming, and as
    // malformed JSON to every parser downstream.
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      const cut = n++ === 0;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: cut ? '{"tldr":"half a sen' : "complete" }] },
              finishReason: cut ? "MAX_TOKENS" : "STOP",
            },
          ],
        }),
      } as unknown as Response;
    });

    const r = await callGemini({ ...base, model: "gemini-2.5-flash" });
    expect(r).toBe("complete");
  });
});
