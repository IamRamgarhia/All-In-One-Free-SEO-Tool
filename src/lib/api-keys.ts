import { getSetting, setSetting } from "./settings-store";
import { decrypt, ensureEncrypted, isEncrypted } from "./crypto";

export type { Provider } from "./api-providers";
export { PROVIDER_CATALOG } from "./api-providers";
import type { Provider } from "./api-providers";

const ENV_VAR: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  together: "TOGETHER_API_KEY",
  github: "GITHUB_TOKEN",
};

const SETTING_KEY: Record<Provider, `api.${Provider}`> = {
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

export async function getApiKey(provider: Provider): Promise<string | null> {
  // Settings DB takes precedence — that's what the user pasted in the UI.
  const fromDb = await getSetting<string>(SETTING_KEY[provider]);
  if (fromDb && fromDb.length > 0) {
    const plain = decrypt(fromDb);
    // Decrypt failed — key missing or corrupt. Don't send `enc:v1:...`
    // ciphertext as the API key Bearer token. Fall through to env var.
    if (plain === null) {
      const fromEnvFallback = process.env[ENV_VAR[provider]];
      return fromEnvFallback && fromEnvFallback.length > 0 ? fromEnvFallback : null;
    }
    // Lazy migration: if the row was stored plaintext, re-write encrypted
    // on first read so subsequent reads/backups carry the protected form.
    if (!isEncrypted(fromDb) && plain) {
      void setSetting(SETTING_KEY[provider], ensureEncrypted(plain)).catch(
        () => undefined,
      );
    }
    return plain;
  }

  const fromEnv = process.env[ENV_VAR[provider]];
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  return null;
}

export async function getOllamaUrl(): Promise<string> {
  const fromDb = await getSetting<string>("api.ollama_url");
  if (fromDb && fromDb.length > 0) return fromDb.replace(/\/+$/, "");
  return process.env.OLLAMA_URL?.replace(/\/+$/, "") ?? "http://localhost:11434";
}

export type ActiveProvider = Provider | "ollama";

/**
 * Returns the user's chosen "active" AI provider — used by every single-LLM
 * feature (exec summary, chatbot, OCR extraction). If they haven't picked one
 * explicitly, picks the first configured provider in catalog priority order.
 *
 * Returns null if literally nothing is configured.
 */
export async function getActiveProvider(): Promise<ActiveProvider | null> {
  const explicit = await getSetting<string>("ai.active_provider");
  if (explicit) {
    // Validate it's still a configured provider
    const { byId } = await configuredProviders();
    if (byId[explicit]) return explicit as ActiveProvider;
  }
  // Fall back to first configured in priority order
  const { ids } = await configuredProviders();
  return (ids[0] as ActiveProvider | undefined) ?? null;
}

/**
 * Returns the list of providers that currently have a key configured
 * (either in DB or in env). Order matches the catalog (free first).
 */
export async function configuredProviders(): Promise<{
  ids: (Provider | "ollama")[];
  byId: Record<string, boolean>;
}> {
  const { PROVIDER_CATALOG } = await import("./api-providers");
  const byId: Record<string, boolean> = {};
  const ids: (Provider | "ollama")[] = [];

  for (const p of PROVIDER_CATALOG) {
    let configured = false;
    if (p.id === "ollama") {
      // Ollama has no key, just check it's reachable lazily — we treat it as
      // "always potentially configured" if the URL setting is non-empty OR if
      // env var is set.
      const url = await getOllamaUrl();
      configured = url.length > 0;
    } else {
      const k = await getApiKey(p.id as Provider);
      configured = k !== null;
    }
    byId[p.id] = configured;
    if (configured) ids.push(p.id);
  }
  return { ids, byId };
}
