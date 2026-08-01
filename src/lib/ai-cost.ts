/**
 * AI cost rate table (USD per 1M tokens). Approximate, edit if vendors change.
 * Conservative — we round UP for "credit-saver" purposes.
 *
 * Returns micros (millionths of a dollar). 1 USD = 1_000_000 micros.
 */

export type CostRate = {
  inputPer1M: number; // USD
  outputPer1M: number;
};

/**
 * Rates come from the model-preset table — the same list that feeds the
 * model picker and the dispatch defaults. Keeping a second hand-written
 * map here is what caused the original bug: it had an entry for
 * `gemini-1.5-flash-latest` (retired) but none for `gemini-2.0-flash`
 * (what actually ran), so every Gemini call silently used the
 * $1/$4 fallback — 13-50x over-stating spend on a free-tier key, and
 * eventually tripping the monthly cap that disables all AI features.
 *
 * A model in the picker now always has a rate, enforced by a test.
 */
import { presetFor } from "./ai-model-presets";

/**
 * Used only for a model id we've never seen — a custom id the user
 * typed by hand. Deliberately mid-range: over-estimating blocks a user
 * at the cap for spend they didn't incur, under-estimating lets real
 * spend run past it. Callers can tell it apart via `isEstimate`.
 */
const FALLBACK_RATE: CostRate = { inputPer1M: 1, outputPer1M: 4 };

export function rateFor(model: string | null | undefined): CostRate {
  if (!model) return FALLBACK_RATE;
  const preset = presetFor(model);
  if (!preset) return FALLBACK_RATE;
  // null = free tier / local model: no per-token charge to bill.
  return {
    inputPer1M: preset.inputPer1M ?? 0,
    outputPer1M: preset.outputPer1M ?? 0,
  };
}

/**
 * True when `rateFor` fell back to the generic estimate rather than a
 * known published rate. The AI-usage UI uses this to show "~" so users
 * don't read a guess as a billed figure.
 */
export function isEstimatedRate(model: string | null | undefined): boolean {
  return !model || !presetFor(model);
}

export function costMicros(
  model: string | null | undefined,
  promptTokens: number,
  completionTokens: number,
): number {
  const r = rateFor(model);
  const inUsd = (promptTokens * r.inputPer1M) / 1_000_000;
  const outUsd = (completionTokens * r.outputPer1M) / 1_000_000;
  return Math.round((inUsd + outUsd) * 1_000_000);
}

export function microsToDollars(micros: number): number {
  return micros / 1_000_000;
}

export function microsToDisplay(micros: number): string {
  const usd = microsToDollars(micros);
  if (usd === 0) return "$0";
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Estimate tokens via the standard ~4-char-per-token heuristic. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
