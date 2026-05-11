/**
 * Multimodal AI calls — text + optional image input. Routes through the
 * active provider, picking endpoints + payload shapes that support
 * vision. Gemini, OpenAI gpt-4o-mini, Anthropic Claude, and OpenRouter
 * (most models) accept images. Groq + Perplexity vary.
 *
 * Returns null on any failure. Logs every call to ai_calls so the
 * usage meter is consistent.
 */

import { getActiveProvider, getApiKey, getOllamaUrl } from "./api-keys";
import { logAiCall, checkMonthlyCap } from "./ai-usage";
import { callGemini as sharedCallGemini } from "./providers/gemini";
import { callAnthropic as sharedCallAnthropic } from "./providers/anthropic";
import { callOpenAICompat as sharedCallOpenAICompat } from "./providers/openai-compat";

export type VisionMessage =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "user";
      content: string;
      image: { mimeType: string; base64: string };
    };

export type VisionCallOpts = {
  system: string;
  messages: VisionMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  feature?: string;
  clientId?: number | null;
  providerOverride?: import("./api-keys").ActiveProvider;
  modelOverride?: string;
};

export async function callAIVision(opts: VisionCallOpts): Promise<string | null> {
  // Per-call provider override (only honored if user has a key for it)
  let provider: import("./api-keys").ActiveProvider | null = null;
  if (opts.providerOverride) {
    if (opts.providerOverride === "ollama") {
      const url = await getOllamaUrl();
      if (url) provider = "ollama";
    } else {
      const k = await getApiKey(opts.providerOverride);
      if (k) provider = opts.providerOverride;
    }
  }
  if (!provider) provider = await getActiveProvider();
  if (!provider) return null;

  const cap = await checkMonthlyCap();
  if (cap.capped) {
    void logAiCall({
      feature: opts.feature ?? "general",
      provider,
      model: null,
      promptText: opts.messages.map((m) => m.content).join("\n"),
      completionText: null,
      status: "blocked_by_cap",
      errorMsg: `Monthly cap of $${cap.capUsd?.toFixed(2)} reached.`,
      clientId: opts.clientId ?? null,
    });
    return null;
  }

  const max = opts.maxTokens ?? 1500;
  const temperature = opts.temperature ?? 0.5;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const start = Date.now();
  let model: string | null = null;
  let text: string | null = null;
  let errorMsg: string | undefined;

  try {
    if (provider === "gemini") {
      const k = await getApiKey("gemini");
      if (!k) return null;
      model = opts.modelOverride || "gemini-2.5-flash";
      text = await callGemini({
        apiKey: k,
        model,
        system: opts.system,
        messages: opts.messages,
        max,
        temperature,
        timeoutMs,
      });
    } else if (provider === "anthropic") {
      const k = await getApiKey("anthropic");
      if (!k) return null;
      model = opts.modelOverride || "claude-haiku-4-5-20251001";
      text = await callAnthropic({
        apiKey: k,
        system: opts.system,
        messages: opts.messages,
        max,
        temperature,
        timeoutMs,
      });
    } else if (provider === "openai") {
      const k = await getApiKey("openai");
      if (!k) return null;
      model = opts.modelOverride || "gpt-4o-mini";
      text = await callOpenAI({
        apiKey: k,
        system: opts.system,
        messages: opts.messages,
        max,
        temperature,
        timeoutMs,
      });
    } else if (provider === "openrouter") {
      const k = await getApiKey("openrouter");
      if (!k) return null;
      // Use a vision-capable free model
      model = opts.modelOverride || "meta-llama/llama-3.2-11b-vision-instruct:free";
      text = await callOpenAI({
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        extraHeaders: { "x-title": "SEO Tool" },
        apiKey: k,
        model,
        system: opts.system,
        messages: opts.messages,
        max,
        temperature,
        timeoutMs,
      });
    } else {
      // Groq / Perplexity / Ollama — strip image and fall through to text
      const textOnlyMessages = opts.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      // Reuse the existing text-only ai-call by simulating
      const { callAI } = await import("./ai-call");
      const lastUser = textOnlyMessages[textOnlyMessages.length - 1];
      if (!lastUser || lastUser.role !== "user") return null;
      const transcript = textOnlyMessages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");
      text = await callAI({
        system: opts.system + "\n\n[Note: this provider doesn't support image input — answer the text portion only.]",
        user: transcript,
        maxTokens: max,
        temperature,
        timeoutMs,
        feature: opts.feature as never,
        clientId: opts.clientId ?? null,
        ignoreCreditSaver: true,
      });
      if (text) {
        // ai-call already logs; return early
        return text;
      }
    }
  } catch (err) {
    errorMsg = (err as Error).message;
    text = null;
  }

  void logAiCall({
    feature: opts.feature ?? "general",
    provider,
    model,
    promptText: opts.system + "\n" + opts.messages.map((m) => m.content).join("\n"),
    completionText: text,
    latencyMs: Date.now() - start,
    clientId: opts.clientId ?? null,
    status: text ? "ok" : "error",
    errorMsg,
  });

  return text;
}

// =============== Provider impls ===============

type Args = {
  apiKey: string;
  system: string;
  messages: VisionMessage[];
  max: number;
  temperature: number;
  timeoutMs: number;
  endpoint?: string;
  model?: string;
  extraHeaders?: Record<string, string>;
};

async function callOpenAI(args: Args): Promise<string | null> {
  return sharedCallOpenAICompat({
    endpoint: args.endpoint ?? "https://api.openai.com/v1/chat/completions",
    apiKey: args.apiKey,
    model: args.model ?? "gpt-4o-mini",
    system: args.system,
    messages: args.messages,
    maxTokens: args.max,
    temperature: args.temperature,
    timeoutMs: args.timeoutMs,
    extraHeaders: args.extraHeaders,
    caller: "ai-vision",
  });
}

async function callAnthropic(args: Args): Promise<string | null> {
  return sharedCallAnthropic({
    apiKey: args.apiKey,
    model: args.model,
    system: args.system,
    messages: args.messages,
    maxTokens: args.max,
    temperature: args.temperature,
    timeoutMs: args.timeoutMs,
    caller: "ai-vision",
  });
}

async function callGemini(args: Args): Promise<string | null> {
  return sharedCallGemini({
    apiKey: args.apiKey,
    model: args.model,
    system: args.system,
    messages: args.messages,
    maxTokens: args.max,
    temperature: args.temperature,
    timeoutMs: args.timeoutMs,
    caller: "ai-vision",
  });
}
