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
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), args.timeoutMs);
  try {
    const messages: unknown[] = [{ role: "system", content: args.system }];
    for (const m of args.messages) {
      if ("image" in m && m.image) {
        messages.push({
          role: m.role,
          content: [
            { type: "text", text: m.content },
            {
              type: "image_url",
              image_url: {
                url: `data:${m.image.mimeType};base64,${m.image.base64}`,
              },
            },
          ],
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const res = await fetch(
      args.endpoint ?? "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        signal: c.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${args.apiKey}`,
          ...(args.extraHeaders ?? {}),
        },
        body: JSON.stringify({
          model: args.model ?? "gpt-4o-mini",
          max_tokens: args.max,
          temperature: args.temperature,
          messages,
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } finally {
    clearTimeout(t);
  }
}

async function callAnthropic(args: Args): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), args.timeoutMs);
  try {
    const messages = args.messages.map((m) => {
      if ("image" in m && m.image) {
        return {
          role: m.role,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: m.image.mimeType,
                data: m.image.base64,
              },
            },
            { type: "text", text: m.content },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });
    // Cache the system prompt when large enough for it to matter (≥1024 tok)
    const useCache = (args.system ?? "").length > 4000;
    const systemPayload = useCache
      ? [
          {
            type: "text",
            text: args.system,
            cache_control: { type: "ephemeral" },
          },
        ]
      : args.system;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: c.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: args.max,
        temperature: args.temperature,
        system: systemPayload,
        messages,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    return (
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim() || null
    );
  } finally {
    clearTimeout(t);
  }
}

async function callGemini(args: Args): Promise<string | null> {
  // Build the contents payload once — reused across all fallback model
  // attempts so a single image upload isn't re-encoded per try.
  const contents: unknown[] = [];
  let prepended = false;
  for (const m of args.messages) {
    const parts: unknown[] = [];
    if (!prepended && m.role === "user") {
      parts.push({ text: `${args.system}\n\n${m.content}` });
      prepended = true;
    } else {
      parts.push({ text: m.content });
    }
    if ("image" in m && m.image) {
      parts.push({
        inlineData: {
          mimeType: m.image.mimeType,
          data: m.image.base64,
        },
      });
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts,
    });
  }
  const body = JSON.stringify({
    contents,
    generationConfig: {
      maxOutputTokens: args.max,
      temperature: args.temperature,
    },
  });

  // Same fallback strategy as ai-call.ts: try the picked model first,
  // then walk through known-good free-tier names. Per-request abort
  // controllers so one 404 doesn't poison the others.
  const fallback = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
  ];
  const tryList = args.model
    ? [args.model, ...fallback.filter((m) => m !== args.model)]
    : fallback;
  const deadline = Date.now() + args.timeoutMs;
  let lastError = "";

  for (const model of tryList) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), Math.min(remaining, 30_000));
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json" },
        body,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: {
            content?: { parts?: { text?: string }[] };
            finishReason?: string;
          }[];
          promptFeedback?: { blockReason?: string };
        };
        const reply =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("")
            .trim() || null;
        if (reply) return reply;
        // 200 OK but empty (safety filter / maxTokens=0) — try next
        lastError = `Gemini [${model}] empty (${data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "no candidates"})`;
        continue;
      }
      const errBody = (await res.text().catch(() => "")).slice(0, 240);
      lastError = `Gemini ${res.status} [${model}]: ${errBody || res.statusText}`;
      // Key-level failures — don't waste more attempts
      if (res.status === 401 || res.status === 403) break;
      if (
        res.status === 400 &&
        /API_KEY_INVALID|API key not valid/i.test(errBody)
      )
        break;
    } catch (err) {
      lastError = `Gemini [${model}]: ${(err as Error).message}`;
    } finally {
      clearTimeout(t);
    }
  }

  console.error("[ai-vision] Gemini failed:", lastError);
  return null;
}
