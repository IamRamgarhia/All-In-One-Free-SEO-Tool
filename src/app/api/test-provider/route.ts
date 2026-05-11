/**
 * Test-provider endpoint — runs a tiny real call against the named
 * provider and reports the actual error from whichever stage failed:
 *
 *   1. No key saved at all
 *   2. Key saved but API rejects it (4xx)
 *   3. Network / timeout
 *   4. Wrong model name
 *
 * Critical: bypasses the generic callAI() because that silently returns
 * null on all of the above. We want explicit error messages.
 */

import { getApiKey, getOllamaUrl } from "@/lib/api-keys";
import type { ActiveProvider } from "@/lib/api-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID: ReadonlySet<ActiveProvider> = new Set([
  "openai",
  "anthropic",
  "gemini",
  "perplexity",
  "openrouter",
  "groq",
  "mistral",
  "deepseek",
  "cerebras",
  "together",
  "github",
  "ollama",
]);

type ProbeResult =
  | { ok: true; reply: string }
  | { ok: false; status?: number; error: string };

async function probeGemini(apiKey: string): Promise<ProbeResult> {
  // Current free-tier model names, newest first. We try in order and
  // return on the first 200. gemini-pro is intentionally NOT here — it
  // was removed from the v1beta endpoint and only causes confusion.
  const candidates = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
  ];
  const attempts: string[] = [];
  let authError: { status: number; body: string } | null = null;

  for (const model of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Say: Connected." }] }],
          generationConfig: { maxOutputTokens: 30, temperature: 0 },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const reply =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("")
            .trim() ?? "";
        return {
          ok: true,
          reply: `[${model}] ${reply || "(empty reply but key works)"}`,
        };
      }
      const body = (await res.text()).slice(0, 200);
      attempts.push(`${model}=${res.status}`);
      // Auth-level errors mean the KEY is bad — stop trying other models.
      if (res.status === 401 || res.status === 403) {
        authError = { status: res.status, body };
        break;
      }
      // 400 from v1beta with API_KEY_INVALID is also key-level, not model
      if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) {
        authError = { status: 400, body };
        break;
      }
    } catch (err) {
      attempts.push(`${model}=${(err as Error).message.slice(0, 40)}`);
    }
  }

  if (authError) {
    return {
      ok: false,
      status: authError.status,
      error: `Key rejected (${authError.status}). ${authError.body.replace(/\s+/g, " ").slice(0, 180)}. Generate a fresh key at https://aistudio.google.com/apikey`,
    };
  }
  return {
    ok: false,
    error: `None of the current Gemini models work with this key. Tried: ${attempts.join(", ")}. The key looks valid (no auth error) but lacks access. Most likely fix: open https://aistudio.google.com/apikey → delete the key → create a new one.`,
  };
}

async function probeOpenAICompat(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
}): Promise<ProbeResult> {
  try {
    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
        ...(opts.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "user", content: "Say: Connected." }],
        max_tokens: 30,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return { ok: false, status: res.status, error: body };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
    return { ok: true, reply: reply || "(empty reply but key works)" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function probeAnthropic(apiKey: string): Promise<ProbeResult> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        messages: [{ role: "user", content: "Say: Connected." }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return { ok: false, status: res.status, error: body };
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const reply = data.content?.map((c) => c.text ?? "").join("").trim() ?? "";
    return { ok: true, reply: reply || "(empty reply but key works)" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function probeOllama(url: string): Promise<ProbeResult> {
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Ollama at ${url} returned ${res.status}. Is the daemon running?`,
      };
    }
    const data = (await res.json()) as { models?: { name?: string }[] };
    const count = data.models?.length ?? 0;
    return {
      ok: true,
      reply: `Ollama reachable. ${count} model${count === 1 ? "" : "s"} installed.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't reach Ollama at ${url}: ${(err as Error).message}. Is it running?`,
    };
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    provider?: string;
  } | null;
  const provider = body?.provider as ActiveProvider | undefined;

  if (!provider || !VALID.has(provider)) {
    return Response.json(
      { ok: false, error: "Invalid provider" },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  let result: ProbeResult;

  if (provider === "ollama") {
    const url = await getOllamaUrl();
    if (!url) {
      result = {
        ok: false,
        error: "Ollama URL not set. Save the Ollama URL above first.",
      };
    } else {
      result = await probeOllama(url);
    }
  } else {
    const key = await getApiKey(provider);
    if (!key) {
      result = {
        ok: false,
        error: `No key saved for ${provider}. Paste a key in the field above + click Save, then click Test.`,
      };
    } else if (provider === "gemini") {
      result = await probeGemini(key);
    } else if (provider === "anthropic") {
      result = await probeAnthropic(key);
    } else if (provider === "groq") {
      result = await probeOpenAICompat({
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: key,
        model: "llama-3.3-70b-versatile",
      });
    } else if (provider === "openai") {
      result = await probeOpenAICompat({
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey: key,
        model: "gpt-4o-mini",
      });
    } else if (provider === "openrouter") {
      result = await probeOpenAICompat({
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: key,
        model: "meta-llama/llama-3.3-70b-instruct:free",
        extraHeaders: { "x-title": "SEO Tool" },
      });
    } else if (provider === "perplexity") {
      result = await probeOpenAICompat({
        endpoint: "https://api.perplexity.ai/chat/completions",
        apiKey: key,
        model: "sonar",
      });
    } else if (provider === "mistral") {
      result = await probeOpenAICompat({
        endpoint: "https://api.mistral.ai/v1/chat/completions",
        apiKey: key,
        model: "mistral-large-latest",
      });
    } else if (provider === "deepseek") {
      result = await probeOpenAICompat({
        endpoint: "https://api.deepseek.com/v1/chat/completions",
        apiKey: key,
        model: "deepseek-chat",
      });
    } else if (provider === "cerebras") {
      result = await probeOpenAICompat({
        endpoint: "https://api.cerebras.ai/v1/chat/completions",
        apiKey: key,
        model: "llama-3.3-70b",
      });
    } else if (provider === "together") {
      result = await probeOpenAICompat({
        endpoint: "https://api.together.xyz/v1/chat/completions",
        apiKey: key,
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      });
    } else if (provider === "github") {
      result = await probeOpenAICompat({
        endpoint: "https://models.inference.ai.azure.com/chat/completions",
        apiKey: key,
        model: "gpt-4o",
      });
    } else {
      result = { ok: false, error: `Unknown provider: ${provider}` };
    }
  }

  const elapsedMs = Date.now() - startedAt;

  if (result.ok) {
    return Response.json({
      ok: true,
      provider,
      reply: result.reply.slice(0, 200),
      elapsedMs,
    });
  }

  return Response.json(
    {
      ok: false,
      provider,
      status: result.status,
      error: result.error,
      elapsedMs,
    },
    { status: 200 },
  );
}
