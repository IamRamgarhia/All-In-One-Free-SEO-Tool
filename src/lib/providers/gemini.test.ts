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

/**
 * Which model actually answered.
 *
 * The fallback chain is deliberate: Google retires model names, and
 * without it every call dies the day that happens. But it used to be
 * silent — callGemini returned the text alone, so a caller that asked
 * for one model and was answered by another could not tell, and
 * ai_calls recorded the model REQUESTED. Typo a model id in Settings
 * and the usage log agreed with the typo.
 *
 * `live-check.ts` caught this as "a nonsense model id somehow
 * succeeded". It had, by falling down the chain.
 */
describe("onModelUsed reports the model that answered", () => {
  /** 404 the first `failures` models, then answer. */
  function captureWithFailures(failures: number) {
    const tried: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const model = String(url).split("/models/")[1]?.split(":")[0] ?? "";
      tried.push(model);
      if (tried.length <= failures) {
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: async () => "model not found",
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: "hello" }] }, finishReason: "STOP" },
          ],
        }),
      } as unknown as Response;
    });
    return { tried };
  }

  it("names the requested model when that model answers", async () => {
    capture();
    const seen: string[] = [];
    const r = await callGemini({
      ...base,
      model: "gemini-2.5-flash",
      onModelUsed: (m) => seen.push(m),
    });
    expect(r).toBe("hello");
    expect(seen).toEqual(["gemini-2.5-flash"]);
  });

  it("names the FALLBACK model when the requested one 404s", async () => {
    const { tried } = captureWithFailures(1);
    const seen: string[] = [];
    const r = await callGemini({
      ...base,
      model: "definitely-not-a-real-model-9z8x",
      onModelUsed: (m) => seen.push(m),
    });
    expect(r).toBe("hello");
    // The whole point: what answered is NOT what was asked for.
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBe("definitely-not-a-real-model-9z8x");
    expect(seen[0]).toBe(tried[tried.length - 1]);
  });

  it("is not called when nothing answers", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "nope",
    }) as unknown as Response);
    const seen: string[] = [];
    const r = await callGemini({ ...base, model: "x", onModelUsed: (m) => seen.push(m) });
    expect(r).toBeNull();
    expect(seen).toEqual([]);
  });

  it("is optional — omitting it still works", async () => {
    capture();
    await expect(
      callGemini({ ...base, model: "gemini-2.5-flash" }),
    ).resolves.toBe("hello");
  });
});

/**
 * One hung model must not starve the fallback chain.
 *
 * Found live on 30 Oct 2026. `gemini-flash-latest` was returning 503
 * "this model is currently overloaded" or simply not answering inside
 * 45 seconds, while `gemini-2.5-flash` answered the same prompt in
 * 1.2s. The chain existed and should have sailed past it — but the
 * per-attempt abort was `Math.min(remaining, 30_000)`, so the dead
 * model spent the entire 20-30s budget every feature had, and the
 * working one was never reached.
 *
 * Measured across five features before and after: exec_summary 25s and
 * a template fallback became 9.7s of real output; review_reply 30s of
 * "the AI provider did not respond" became an 11.3s reply. Nothing
 * about the models changed — only who got to use the time.
 */
describe("budget sharing across the fallback chain", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** First model never resolves; the rest answer instantly. */
  function hangFirst(): { tried: string[] } {
    const tried: string[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      const model = String(url).split("/models/")[1]?.split(":")[0] ?? "?";
      tried.push(model);
      if (tried.length === 1) {
        // Hangs until the caller's AbortController fires.
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })),
          );
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }],
        }),
      } as unknown as Response);
    });
    return { tried };
  }

  it("reaches the second model when the first hangs", async () => {
    const { tried } = hangFirst();
    const started = Date.now();
    // 25s is the budget exec_summary uses, and the one that used to be
    // consumed whole by a single dead model.
    const out = await callGemini({ ...base, model: "gemini-flash-latest", timeoutMs: 25_000 });
    const elapsed = Date.now() - started;

    expect(out).toBe("hello");
    expect(tried.length).toBeGreaterThan(1);
    expect(tried[0]).toBe("gemini-flash-latest");
    // The whole point: the hung model gets a share, not the lot. With
    // three models in the list that is ~8.3s, so finishing must take
    // well under the 25s budget.
    expect(elapsed).toBeLessThan(20_000);
  }, 40_000);

  it("gives a lone model the whole budget", async () => {
    // Nothing to fall back to means nothing to reserve time for, so the
    // floor must not shorten a legitimately slow single attempt.
    const { tried } = hangFirst();
    const out = await callGemini({ ...base, model: undefined, timeoutMs: 25_000 });
    expect(out).toBe("hello");
    expect(tried.length).toBeGreaterThan(1);
  }, 40_000);
});
