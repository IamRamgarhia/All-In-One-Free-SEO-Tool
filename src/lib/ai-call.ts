import { getActiveProvider, getApiKey, getOllamaUrl } from "./api-keys";
import { getSetting } from "./settings-store";
import { checkMonthlyCap, logAiCall } from "./ai-usage";
import { withAiPermit } from "./ai-semaphore";
import { callGemini as sharedCallGemini } from "./providers/gemini";
import { callAnthropic as sharedCallAnthropic } from "./providers/anthropic";
import { callOpenAICompat as sharedCallOpenAICompat } from "./providers/openai-compat";

export type AiFeatureName =
  | "exec_summary"
  | "blog_draft"
  | "title_rewrite"
  | "meta_rewrite"
  | "review_reply"
  | "content_idea"
  | "general";

export type AiCallOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Per-call timeout in ms. Defaults to 60s — blog writing can be slow. */
  timeoutMs?: number;
  /**
   * Bypass credit-saver mode. Use only for features where terse output is
   * useless (e.g. full blog drafts that need to be long by definition).
   */
  ignoreCreditSaver?: boolean;
  /**
   * Tags this call so the feedback-learning module can inject learned
   * style rules into the system prompt. Optional but recommended for
   * any user-facing feature that takes corrections.
   */
  feature?: AiFeatureName;
  /** Scopes learned rules to this client when set. */
  clientId?: number | null;
  /**
   * Per-call provider override. When set, the call uses this provider instead
   * of the workspace's active provider. The user must still have a key
   * configured for the override; otherwise we fall back to the active provider
   * (or null if nothing's configured at all).
   */
  providerOverride?: import("./api-keys").ActiveProvider;
  /** Per-call model override paired with providerOverride (or active). */
  modelOverride?: string;
};

/**
 * Calls whichever AI provider the user has set as active. Returns the text
 * response, or null on any failure (no key, network, parsing, etc.).
 *
 * One implementation here means every feature (exec summaries, blog writing,
 * future agents) gets the same provider routing for free.
 *
 * Credit-saver mode (toggled in Settings → AI):
 *   - prepends "Be terse — 2-4 sentences" to the system prompt
 *   - caps maxTokens at 500
 *   - lowers temperature for deterministic answers (cheaper rerolls)
 *   - features that need length (blog writer) opt out via ignoreCreditSaver
 */
export async function callAI(opts: AiCallOptions): Promise<string | null> {
  // Per-call override takes precedence — but only if the user has a key
  // for it. Otherwise fall back to the workspace active provider.
  let active: import("./api-keys").ActiveProvider | null = null;
  if (opts.providerOverride) {
    if (opts.providerOverride === "ollama") {
      const url = await getOllamaUrl();
      if (url) active = "ollama";
    } else {
      const k = await getApiKey(opts.providerOverride);
      if (k) active = opts.providerOverride;
    }
  }
  if (!active) active = await getActiveProvider();
  if (!active) return null;

  // Enforce monthly cap if set
  const cap = await checkMonthlyCap();
  if (cap.capped) {
    void logAiCall({
      feature: opts.feature ?? "general",
      provider: active,
      model: null,
      promptText: opts.user,
      completionText: null,
      status: "blocked_by_cap",
      errorMsg: `Monthly AI cap of $${cap.capUsd?.toFixed(2)} reached.`,
      clientId: opts.clientId ?? null,
    });
    return null;
  }

  let system = opts.system;
  let max = opts.maxTokens ?? 2000;
  let temperature = opts.temperature ?? 0.6;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  // Memory + cost ceiling. A 16k-token response is ~64 KB of string and
  // covers any single AI feature we ship. Anything higher is almost
  // certainly a feature-spec mistake; cap silently rather than letting
  // a runaway prompt eat memory + cost.
  const HARD_TOKEN_CEILING = 16_000;
  if (max > HARD_TOKEN_CEILING) max = HARD_TOKEN_CEILING;

  // Truncate runaway user prompts. Cap at ~50k chars (~12k tokens). Most
  // legitimate prompts are under 5k chars; anything bigger usually means
  // a content-pasting tool forgot to summarize.
  const HARD_USER_CHARS = 50_000;
  const safeUser =
    opts.user.length > HARD_USER_CHARS
      ? opts.user.slice(0, HARD_USER_CHARS) + "\n\n[truncated]"
      : opts.user;

  if (!opts.ignoreCreditSaver) {
    const saver = await getSetting<boolean>("ai.credit_saver.enabled");
    if (saver) {
      system = `Credit-saver mode: keep your answer to 2-4 short sentences. Skip pleasantries, headers, and preamble. Lead with the most useful information first.\n\n${system}`;
      max = Math.min(max, 500);
      temperature = Math.min(temperature, 0.3);
    }
  }

  // Inject learned style rules from the feedback-driven preference store.
  // Silent on failure — never let the learning layer break the call.
  if (opts.feature) {
    try {
      const { getStylePromptForFeature } = await import("./ai-learn");
      const stylePrompt = await getStylePromptForFeature({
        feature: opts.feature,
        clientId: opts.clientId,
      });
      if (stylePrompt) {
        system = `${system}\n\n${stylePrompt}`;
      }
    } catch {
      // ignore
    }
  }

  // Re-pack — downstream provider helpers spread this onto their request
  const packed: AiCallOptions = {
    system,
    user: safeUser,
    maxTokens: max,
    temperature,
    timeoutMs,
  };

  // Wrap dispatch with logging — each path returns (text, model)
  const start = Date.now();
  let model: string | null = null;
  let text: string | null = null;
  let errorMsg: string | undefined;

  // Per-provider default model when no override is given.
  // Updated 2026-05 — Google deprecated -latest suffix; flash models renamed.
  const defaultModel: Record<string, string> = {
    gemini: "gemini-2.0-flash",
    groq: "llama-3.3-70b-versatile",
    anthropic: "claude-haiku-4-5-20251001",
    openai: "gpt-4o-mini",
    openrouter: "meta-llama/llama-3.3-70b-instruct:free",
    perplexity: "sonar",
    ollama: "llama3",
    mistral: "mistral-large-latest",
    deepseek: "deepseek-chat",
    cerebras: "llama-3.3-70b",
    together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    github: "gpt-4o",
  };
  const pickedModel = opts.modelOverride?.trim() || defaultModel[active];

  // Acquire one of the global AI permits. Caps workspace-wide
  // concurrency so the daily-agent's batch generations don't burst
  // the provider's rate limit and break a manual user action that
  // happens to fire at the same moment. Permits are auto-released
  // in finally even when the dispatch throws.
  await withAiPermit(async () => {
  try {
    if (active === "gemini") {
      const k = await getApiKey("gemini");
      if (!k) return null;
      model = pickedModel;
      text = await callGemini({ apiKey: k, model, ...packed, max, temperature, timeoutMs });
    } else if (active === "groq") {
      const k = await getApiKey("groq");
      if (!k) return null;
      model = pickedModel;
      text = await callOpenAICompat({
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: k,
        model,
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    } else if (active === "anthropic") {
      const k = await getApiKey("anthropic");
      if (!k) return null;
      model = pickedModel;
      text = await callAnthropic({ apiKey: k, model, ...packed, max, temperature, timeoutMs });
    } else if (active === "openai") {
      const k = await getApiKey("openai");
      if (!k) return null;
      model = pickedModel;
      text = await callOpenAICompat({
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey: k,
        model,
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    } else if (active === "openrouter") {
      const k = await getApiKey("openrouter");
      if (!k) return null;
      model = pickedModel;
      text = await callOpenAICompat({
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: k,
        model,
        extraHeaders: { "x-title": "SEO Tool" },
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    } else if (active === "perplexity") {
      const k = await getApiKey("perplexity");
      if (!k) return null;
      model = pickedModel;
      text = await callOpenAICompat({
        endpoint: "https://api.perplexity.ai/chat/completions",
        apiKey: k,
        model,
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    } else if (active === "ollama") {
      const url = await getOllamaUrl();
      model = pickedModel;
      text = await callOllama({ url, model, ...packed, max, temperature, timeoutMs });
    } else if (active === "mistral") {
      const k = await getApiKey("mistral");
      if (!k) return null;
      model = pickedModel;
      text = await callOpenAICompat({
        endpoint: "https://api.mistral.ai/v1/chat/completions",
        apiKey: k,
        model,
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    } else if (active === "deepseek") {
      const k = await getApiKey("deepseek");
      if (!k) return null;
      model = pickedModel;
      text = await callOpenAICompat({
        endpoint: "https://api.deepseek.com/v1/chat/completions",
        apiKey: k,
        model,
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    } else if (active === "cerebras") {
      const k = await getApiKey("cerebras");
      if (!k) return null;
      model = pickedModel;
      text = await callOpenAICompat({
        endpoint: "https://api.cerebras.ai/v1/chat/completions",
        apiKey: k,
        model,
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    } else if (active === "together") {
      const k = await getApiKey("together");
      if (!k) return null;
      model = pickedModel;
      text = await callOpenAICompat({
        endpoint: "https://api.together.xyz/v1/chat/completions",
        apiKey: k,
        model,
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    } else if (active === "github") {
      const k = await getApiKey("github");
      if (!k) return null;
      model = pickedModel;
      text = await callOpenAICompat({
        endpoint: "https://models.inference.ai.azure.com/chat/completions",
        apiKey: k,
        model,
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    }
  } catch (err) {
    errorMsg = (err as Error).message;
    text = null;
  }
  });

  // Log every call (success or failure) — async-fire, never block
  void logAiCall({
    feature: opts.feature ?? "general",
    provider: active,
    model,
    promptText: `${system}\n\n${opts.user}`,
    completionText: text,
    latencyMs: Date.now() - start,
    clientId: opts.clientId ?? null,
    status: text ? "ok" : "error",
    errorMsg,
  });

  return text;
}

type CallArgs = AiCallOptions & {
  apiKey?: string;
  max: number;
  temperature: number;
  timeoutMs: number;
  /** Provider-specific model name. */
  model?: string;
};

async function callGemini(args: CallArgs): Promise<string | null> {
  // Returns null on any failure to match the contract of every other
  // provider's caller in this file. (Previously this threw, which made
  // Gemini the odd one out — the dispatcher catches errors but null vs
  // thrown affected downstream logging.)
  return sharedCallGemini({
    apiKey: args.apiKey ?? "",
    model: args.model,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    maxTokens: args.max,
    temperature: args.temperature,
    timeoutMs: args.timeoutMs,
    caller: "ai-call",
  });
}

async function callAnthropic(args: CallArgs): Promise<string | null> {
  return sharedCallAnthropic({
    apiKey: args.apiKey ?? "",
    model: args.model,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    maxTokens: args.max,
    temperature: args.temperature,
    timeoutMs: args.timeoutMs,
    caller: "ai-call",
  });
}

async function callOpenAICompat(
  args: CallArgs & {
    endpoint: string;
    model: string;
    extraHeaders?: Record<string, string>;
  },
): Promise<string | null> {
  return sharedCallOpenAICompat({
    endpoint: args.endpoint,
    apiKey: args.apiKey ?? "",
    model: args.model,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    maxTokens: args.max,
    temperature: args.temperature,
    timeoutMs: args.timeoutMs,
    extraHeaders: args.extraHeaders,
    caller: "ai-call",
  });
}

async function callOllama(args: CallArgs & { url: string }): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), args.timeoutMs);
  try {
    const res = await fetch(`${args.url}/api/chat`, {
      method: "POST",
      signal: c.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: args.model || "llama3.2",
        stream: false,
        options: { temperature: args.temperature, num_predict: args.max },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      message?: { content?: string };
    };
    return data.message?.content?.trim() ?? null;
  } finally {
    clearTimeout(t);
  }
}
