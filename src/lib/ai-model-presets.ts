/**
 * Per-provider model presets for the user-facing model picker.
 *
 * No DB / no server-only imports — safe for client components. Selecting a
 * preset just sets `providerOverride` + `modelOverride` on the next callAI()
 * invocation; the user's API key is never sent to the browser.
 */

import type { ActiveProvider } from "./api-keys";

export type ModelPreset = {
  /** Model id sent to the provider's API. */
  id: string;
  /** Short label shown in the UI. */
  label: string;
  /** One-liner about cost / speed / use case. */
  hint: string;
};

export const MODEL_PRESETS: Record<ActiveProvider, ModelPreset[]> = {
  gemini: [
    {
      id: "gemini-1.5-flash-latest",
      label: "Gemini 1.5 Flash",
      hint: "Free tier · fast · default",
    },
    {
      id: "gemini-1.5-pro-latest",
      label: "Gemini 1.5 Pro",
      hint: "Stronger reasoning · paid quota",
    },
    {
      id: "gemini-2.0-flash-exp",
      label: "Gemini 2.0 Flash (experimental)",
      hint: "Newer · faster · check availability",
    },
  ],
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      label: "Llama 3.3 70B",
      hint: "Fast · free tier · default",
    },
    {
      id: "llama-3.1-8b-instant",
      label: "Llama 3.1 8B Instant",
      hint: "Fastest · for short answers",
    },
    {
      id: "mixtral-8x7b-32768",
      label: "Mixtral 8×7B",
      hint: "32k context · balanced",
    },
  ],
  anthropic: [
    {
      id: "claude-haiku-4-5-20251001",
      label: "Claude Haiku 4.5",
      hint: "Cheapest · fastest · default",
    },
    {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      hint: "Balanced quality + cost",
    },
    {
      id: "claude-opus-4-7",
      label: "Claude Opus 4.7",
      hint: "Highest quality · most expensive",
    },
  ],
  openai: [
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      hint: "Cheapest · fast · default",
    },
    {
      id: "gpt-4o",
      label: "GPT-4o",
      hint: "Balanced flagship",
    },
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      hint: "Newer · check availability",
    },
  ],
  openrouter: [
    {
      id: "meta-llama/llama-3.3-70b-instruct:free",
      label: "Llama 3.3 70B (free)",
      hint: "Free tier · default",
    },
    {
      id: "anthropic/claude-3.5-sonnet",
      label: "Anthropic Claude 3.5 Sonnet (via OR)",
      hint: "Paid · strong reasoning",
    },
    {
      id: "openai/gpt-4o-mini",
      label: "OpenAI GPT-4o mini (via OR)",
      hint: "Paid · cheapest GPT-4o tier",
    },
    {
      id: "google/gemini-2.0-flash-exp:free",
      label: "Gemini 2.0 Flash (free, via OR)",
      hint: "Free if available",
    },
  ],
  perplexity: [
    {
      id: "sonar",
      label: "Sonar",
      hint: "Default · web-aware answers",
    },
    {
      id: "sonar-pro",
      label: "Sonar Pro",
      hint: "Higher quality · paid",
    },
    {
      id: "sonar-reasoning",
      label: "Sonar Reasoning",
      hint: "Step-by-step reasoning model",
    },
  ],
  ollama: [
    {
      id: "llama3.2",
      label: "Llama 3.2",
      hint: "Local · default",
    },
    {
      id: "llama3.1",
      label: "Llama 3.1 8B",
      hint: "Local · smaller",
    },
    {
      id: "mistral",
      label: "Mistral 7B",
      hint: "Local · fast",
    },
    {
      id: "phi3",
      label: "Phi-3",
      hint: "Local · tiny + fast",
    },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large", hint: "Frontier" },
    { id: "mistral-small-latest", label: "Mistral Small", hint: "Fast" },
    { id: "codestral-latest", label: "Codestral", hint: "Code-focused" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek V3", hint: "Default · cheap" },
    { id: "deepseek-reasoner", label: "DeepSeek R1", hint: "Reasoning" },
  ],
  cerebras: [
    { id: "llama-3.3-70b", label: "Llama 3.3 70B", hint: "2000+ tok/s" },
    { id: "llama3.1-8b", label: "Llama 3.1 8B", hint: "Faster · cheaper" },
  ],
  together: [
    {
      id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      label: "Llama 3.3 70B Turbo",
      hint: "Default",
    },
    {
      id: "Qwen/Qwen2.5-72B-Instruct-Turbo",
      label: "Qwen 2.5 72B",
      hint: "Strong reasoning",
    },
    {
      id: "deepseek-ai/DeepSeek-V3",
      label: "DeepSeek V3",
      hint: "Cheap + capable",
    },
  ],
  github: [
    { id: "gpt-4o", label: "GPT-4o", hint: "Default" },
    { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Faster" },
    { id: "Phi-3.5-mini-instruct", label: "Phi-3.5 mini", hint: "Tiny" },
    { id: "Meta-Llama-3.1-70B-Instruct", label: "Llama 3.1 70B", hint: "Open-source" },
  ],
};

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
