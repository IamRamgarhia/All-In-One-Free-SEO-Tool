/**
 * Per-provider model presets for the user-facing model picker — and the
 * SINGLE SOURCE OF TRUTH for model ids, defaults, and price rates.
 *
 * No DB / no server-only imports — safe for client components. Selecting a
 * preset just sets `providerOverride` + `modelOverride` on the next callAI()
 * invocation; the user's API key is never sent to the browser.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Why this file owns rates as well as labels
 * ─────────────────────────────────────────────────────────────────────
 * These three used to live in three places and drifted apart:
 *
 *   1. `ai-model-presets.ts` — what the picker offers the user
 *   2. `provider-dispatch.ts` — the default model actually sent
 *   3. `ai-cost.ts`           — the $/1M rate used for spend tracking
 *
 * The drift produced a chain of user-visible bugs: the picker offered
 * `gemini-1.5-flash-latest` labelled "default" (retired by Google in
 * Sept 2025 → 404), dispatch actually sent `gemini-2.0-flash`, and the
 * rate table had an entry for the dead id but not the live one — so
 * every Gemini call fell through to a $1/$4 fallback rate, ~13-50x
 * over-stating spend on a free-tier key and eventually tripping the
 * monthly cap, which silently disabled every AI feature.
 *
 * Now `defaultModelFor()`, the picker, and `rateFor()` all read this
 * array. Adding a model means one entry. A model that appears in the
 * picker is guaranteed to have a rate, and `ai-model-presets.test.ts`
 * asserts exactly that.
 *
 * Rates are USD per 1M tokens and are approximate — vendors change them.
 * `null` means "free tier / local / no per-token charge".
 */

import type { ActiveProvider } from "./api-keys";

export type ModelPreset = {
  /** Model id sent to the provider's API. */
  id: string;
  /** Short label shown in the UI. */
  label: string;
  /** One-liner about cost / speed / use case. */
  hint: string;
  /**
   * USD per 1M input tokens. `null` = no per-token charge we can bill
   * (free tier, local model). Used by ai-cost.ts.
   */
  inputPer1M: number | null;
  /** USD per 1M output tokens. */
  outputPer1M: number | null;
};

/**
 * The first entry for each provider is that provider's default model —
 * `defaultModelFor()` returns it, and `provider-dispatch.ts` uses it as
 * the dispatch default. Order matters: cheapest/fastest first, so the
 * default is always the one that keeps a free-tier user inside their
 * quota.
 */
export const MODEL_PRESETS: Record<ActiveProvider, ModelPreset[]> = {
  gemini: [
    {
      id: "gemini-2.0-flash",
      label: "Gemini 2.0 Flash",
      hint: "Free tier · fast · default",
      inputPer1M: 0.1,
      outputPer1M: 0.4,
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      hint: "Newer · better reasoning",
      inputPer1M: 0.3,
      outputPer1M: 2.5,
    },
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      hint: "Strongest Gemini · paid quota",
      inputPer1M: 1.25,
      outputPer1M: 10,
    },
  ],
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      label: "Llama 3.3 70B",
      hint: "Fast · free tier · default",
      inputPer1M: 0.59,
      outputPer1M: 0.79,
    },
    {
      id: "llama-3.1-8b-instant",
      label: "Llama 3.1 8B Instant",
      hint: "Fastest · for short answers",
      inputPer1M: 0.05,
      outputPer1M: 0.08,
    },
  ],
  anthropic: [
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      hint: "Cheapest · fastest · default",
      inputPer1M: 1,
      outputPer1M: 5,
    },
    {
      id: "claude-sonnet-5",
      label: "Claude Sonnet 5",
      hint: "Balanced quality + cost",
      inputPer1M: 3,
      outputPer1M: 15,
    },
    {
      id: "claude-opus-5",
      label: "Claude Opus 5",
      hint: "Highest quality · most expensive",
      inputPer1M: 5,
      outputPer1M: 25,
    },
  ],
  openai: [
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      hint: "Cheapest · fast · default",
      inputPer1M: 0.15,
      outputPer1M: 0.6,
    },
    {
      id: "gpt-4.1-mini",
      label: "GPT-4.1 mini",
      hint: "Newer small model",
      inputPer1M: 0.4,
      outputPer1M: 1.6,
    },
    {
      id: "gpt-4o",
      label: "GPT-4o",
      hint: "Balanced flagship",
      inputPer1M: 2.5,
      outputPer1M: 10,
    },
  ],
  openrouter: [
    {
      id: "meta-llama/llama-3.3-70b-instruct:free",
      label: "Llama 3.3 70B (free)",
      hint: "Free tier · default",
      inputPer1M: 0,
      outputPer1M: 0,
    },
    {
      id: "google/gemini-2.0-flash-001",
      label: "Gemini 2.0 Flash (via OR)",
      hint: "Cheap · fast",
      inputPer1M: 0.1,
      outputPer1M: 0.4,
    },
    {
      id: "openai/gpt-4o-mini",
      label: "OpenAI GPT-4o mini (via OR)",
      hint: "Paid · cheapest GPT-4o tier",
      inputPer1M: 0.15,
      outputPer1M: 0.6,
    },
  ],
  perplexity: [
    {
      id: "sonar",
      label: "Sonar",
      hint: "Default · searches the live web",
      inputPer1M: 1,
      outputPer1M: 1,
    },
    {
      id: "sonar-pro",
      label: "Sonar Pro",
      hint: "Higher quality · paid",
      inputPer1M: 3,
      outputPer1M: 15,
    },
    {
      id: "sonar-reasoning",
      label: "Sonar Reasoning",
      hint: "Step-by-step reasoning model",
      inputPer1M: 1,
      outputPer1M: 5,
    },
  ],
  ollama: [
    {
      id: "llama3.2",
      label: "Llama 3.2",
      hint: "Local · default · free",
      inputPer1M: null,
      outputPer1M: null,
    },
    {
      id: "llama3.1",
      label: "Llama 3.1 8B",
      hint: "Local · smaller",
      inputPer1M: null,
      outputPer1M: null,
    },
    {
      id: "mistral",
      label: "Mistral 7B",
      hint: "Local · fast",
      inputPer1M: null,
      outputPer1M: null,
    },
    {
      id: "phi3",
      label: "Phi-3",
      hint: "Local · tiny + fast",
      inputPer1M: null,
      outputPer1M: null,
    },
  ],
  mistral: [
    {
      id: "mistral-small-latest",
      label: "Mistral Small",
      hint: "Fast · cheap · default",
      inputPer1M: 0.2,
      outputPer1M: 0.6,
    },
    {
      id: "mistral-large-latest",
      label: "Mistral Large",
      hint: "Frontier",
      inputPer1M: 2,
      outputPer1M: 6,
    },
    {
      id: "codestral-latest",
      label: "Codestral",
      hint: "Code-focused",
      inputPer1M: 0.3,
      outputPer1M: 0.9,
    },
  ],
  deepseek: [
    {
      id: "deepseek-chat",
      label: "DeepSeek V3",
      hint: "Default · cheap",
      inputPer1M: 0.27,
      outputPer1M: 1.1,
    },
    {
      id: "deepseek-reasoner",
      label: "DeepSeek R1",
      hint: "Reasoning",
      inputPer1M: 0.55,
      outputPer1M: 2.19,
    },
  ],
  cerebras: [
    {
      id: "llama-3.3-70b",
      label: "Llama 3.3 70B",
      hint: "2000+ tok/s · default",
      inputPer1M: 0.85,
      outputPer1M: 1.2,
    },
    {
      id: "llama3.1-8b",
      label: "Llama 3.1 8B",
      hint: "Faster · cheaper",
      inputPer1M: 0.1,
      outputPer1M: 0.1,
    },
  ],
  together: [
    {
      id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      label: "Llama 3.3 70B Turbo",
      hint: "Default",
      inputPer1M: 0.88,
      outputPer1M: 0.88,
    },
    {
      id: "Qwen/Qwen2.5-72B-Instruct-Turbo",
      label: "Qwen 2.5 72B",
      hint: "Strong reasoning",
      inputPer1M: 1.2,
      outputPer1M: 1.2,
    },
    {
      id: "deepseek-ai/DeepSeek-V3",
      label: "DeepSeek V3",
      hint: "Cheap + capable",
      inputPer1M: 1.25,
      outputPer1M: 1.25,
    },
  ],
  github: [
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      hint: "Default · free tier",
      inputPer1M: 0,
      outputPer1M: 0,
    },
    {
      id: "gpt-4o",
      label: "GPT-4o",
      hint: "Free tier · slower quota",
      inputPer1M: 0,
      outputPer1M: 0,
    },
  ],
};

/** Every preset across every provider, flattened. */
export function allPresets(): ModelPreset[] {
  return Object.values(MODEL_PRESETS).flat();
}

/**
 * Look up a preset by model id, regardless of provider. Returns
 * undefined for a custom/unknown id the user typed by hand.
 */
export function presetFor(modelId: string): ModelPreset | undefined {
  const needle = modelId.trim().toLowerCase();
  if (!needle) return undefined;
  return allPresets().find((p) => p.id.toLowerCase() === needle);
}

/**
 * The default model for a provider = the first preset in its list.
 *
 * `provider-dispatch.ts` re-exports this so the model the picker labels
 * "default" and the model actually sent when no override is set can
 * never disagree again.
 */
export function defaultModelFor(provider: ActiveProvider): string {
  return MODEL_PRESETS[provider]?.[0]?.id ?? "";
}

export const PROVIDER_LABEL: Record<ActiveProvider, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  perplexity: "Perplexity",
  ollama: "Ollama (local)",
  mistral: "Mistral AI",
  deepseek: "DeepSeek",
  cerebras: "Cerebras",
  together: "Together AI",
  github: "GitHub Models",
};
