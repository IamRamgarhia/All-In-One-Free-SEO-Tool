"use server";

import { revalidatePath } from "next/cache";
import {
  deleteSetting,
  setSetting,
  type SettingKey,
} from "@/lib/settings-store";
import { type Provider } from "@/lib/api-providers";

const ALLOWED_KEYS: Record<Provider, SettingKey> = {
  openai: "api.openai",
  anthropic: "api.anthropic",
  gemini: "api.gemini",
  perplexity: "api.perplexity",
  openrouter: "api.openrouter",
  groq: "api.groq",
  mistral: "api.mistral",
  deepseek: "api.deepseek",
  cerebras: "api.cerebras",
  together: "api.together",
  github: "api.github",
};

export async function saveApiKey(
  provider: Provider,
  formData: FormData,
): Promise<void> {
  const key = ALLOWED_KEYS[provider];
  if (!key) return;
  const raw = String(formData.get("value") ?? "").trim();
  if (raw === "") {
    await deleteSetting(key);
  } else {
    await setSetting(key, raw);
  }
  revalidatePath("/settings");
  revalidatePath("/ai-visibility");
}

export async function saveOllamaUrl(formData: FormData): Promise<void> {
  const raw = String(formData.get("value") ?? "").trim();
  if (raw === "") {
    await deleteSetting("api.ollama_url");
  } else {
    await setSetting("api.ollama_url", raw.replace(/\/+$/, ""));
  }
  revalidatePath("/settings");
  revalidatePath("/ai-visibility");
}

export async function setActiveProvider(
  provider: Provider | "ollama",
): Promise<void> {
  const allowed: (Provider | "ollama")[] = [
    "openai",
    "anthropic",
    "gemini",
    "perplexity",
    "openrouter",
    "groq",
    "ollama",
  ];
  if (!allowed.includes(provider)) return;
  await setSetting("ai.active_provider", provider);
  revalidatePath("/settings");
  revalidatePath("/ai-visibility");
  revalidatePath("/", "layout");
}

export async function setCreditSaverEnabled(enabled: boolean): Promise<void> {
  await setSetting("ai.credit_saver.enabled", enabled);
  revalidatePath("/settings");
}
