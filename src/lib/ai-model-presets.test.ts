import { describe, expect, it } from "vitest";
import {
  MODEL_PRESETS,
  allPresets,
  defaultModelFor,
  presetFor,
  PROVIDER_LABEL,
} from "./ai-model-presets";
import { PROVIDER_DISPATCH } from "./provider-dispatch";
import { rateFor, isEstimatedRate, costMicros } from "./ai-cost";

/**
 * This file exists because the picker, the dispatch default, and the
 * cost table drifted apart and produced a chain of silent failures:
 * the picker offered a retired Gemini id labelled "default" (404 →
 * callAI returns null → blank UI), dispatch actually sent a different
 * model, and the rate table had no entry for that model so every call
 * billed at a ~13-50x-too-high fallback rate and eventually tripped the
 * monthly cap, disabling every AI feature.
 *
 * Each assertion below breaks a link in that chain.
 */

describe("model presets", () => {
  it("gives every provider at least one model", () => {
    for (const [provider, presets] of Object.entries(MODEL_PRESETS)) {
      expect(presets.length, `${provider} has no presets`).toBeGreaterThan(0);
    }
  });

  it("has a dispatch entry for every provider with presets", () => {
    for (const provider of Object.keys(MODEL_PRESETS)) {
      expect(
        PROVIDER_DISPATCH[provider as keyof typeof PROVIDER_DISPATCH],
        `${provider} has presets but no dispatch spec`,
      ).toBeDefined();
    }
  });

  it("has a label for every provider", () => {
    for (const provider of Object.keys(MODEL_PRESETS)) {
      expect(
        PROVIDER_LABEL[provider as keyof typeof PROVIDER_LABEL],
      ).toBeTruthy();
    }
  });

  it("resolves defaultModelFor to a real preset for every provider", () => {
    for (const provider of Object.keys(MODEL_PRESETS)) {
      const id = defaultModelFor(provider as keyof typeof MODEL_PRESETS);
      expect(id, `${provider} default is empty`).toBeTruthy();
      expect(
        presetFor(id),
        `${provider} default "${id}" is not in its preset list`,
      ).toBeDefined();
    }
  });

  it("prices every offered model — no silent fallback rate", () => {
    // The original bug: a model the picker offered had no rate entry,
    // so it billed at the generic estimate without anything surfacing.
    for (const preset of allPresets()) {
      expect(
        isEstimatedRate(preset.id),
        `"${preset.id}" is offered in the picker but has no published rate`,
      ).toBe(false);
    }
  });

  it("uses non-negative rates", () => {
    for (const preset of allPresets()) {
      if (preset.inputPer1M !== null) {
        expect(preset.inputPer1M).toBeGreaterThanOrEqual(0);
      }
      if (preset.outputPer1M !== null) {
        expect(preset.outputPer1M).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("has unique model ids within a provider", () => {
    for (const [provider, presets] of Object.entries(MODEL_PRESETS)) {
      const ids = presets.map((p) => p.id);
      expect(new Set(ids).size, `${provider} has duplicate model ids`).toBe(
        ids.length,
      );
    }
  });

  it("carries no retired model ids", () => {
    // Every id here 404s upstream. They shipped in the picker and were
    // the reason "generate" silently produced nothing.
    const retired = [
      "gemini-1.5-flash-latest",
      "gemini-1.5-pro-latest",
      "gemini-2.0-flash-exp",
      "mixtral-8x7b-32768",
      "anthropic/claude-3.5-sonnet",
      "claude-3-5-sonnet-20241022",
      "claude-3-opus-20240229",
    ];
    const offered = allPresets().map((p) => p.id);
    for (const id of retired) {
      expect(offered, `retired model "${id}" is still offered`).not.toContain(
        id,
      );
    }
  });

  it("does not use the deprecated Google -latest suffix", () => {
    for (const preset of MODEL_PRESETS.gemini) {
      expect(preset.id.endsWith("-latest")).toBe(false);
    }
  });
});

describe("cost", () => {
  it("charges nothing for local models", () => {
    const r = rateFor("llama3.2");
    expect(r.inputPer1M).toBe(0);
    expect(r.outputPer1M).toBe(0);
    expect(costMicros("llama3.2", 1_000_000, 1_000_000)).toBe(0);
  });

  it("computes a known rate correctly", () => {
    // Haiku 4.5 is $1/1M in, $5/1M out.
    expect(costMicros("claude-haiku-4-5", 1_000_000, 0)).toBe(1_000_000);
    expect(costMicros("claude-haiku-4-5", 0, 1_000_000)).toBe(5_000_000);
  });

  it("flags an unknown model as an estimate rather than pricing it silently", () => {
    expect(isEstimatedRate("some-model-the-user-typed")).toBe(true);
    expect(isEstimatedRate(null)).toBe(true);
  });

  it("matches model ids case-insensitively", () => {
    expect(presetFor("CLAUDE-HAIKU-4-5")?.id).toBe("claude-haiku-4-5");
  });
});
