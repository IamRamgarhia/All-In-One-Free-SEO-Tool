import { getActiveProvider, getApiKey, getOllamaUrl } from "./api-keys";

export type AiCallOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Per-call timeout in ms. Defaults to 60s — blog writing can be slow. */
  timeoutMs?: number;
};

/**
 * Calls whichever AI provider the user has set as active. Returns the text
 * response, or null on any failure (no key, network, parsing, etc.).
 *
 * One implementation here means every feature (exec summaries, blog writing,
 * future agents) gets the same provider routing for free.
 */
export async function callAI(opts: AiCallOptions): Promise<string | null> {
  const active = await getActiveProvider();
  if (!active) return null;

  const max = opts.maxTokens ?? 2000;
  const temperature = opts.temperature ?? 0.6;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  try {
    if (active === "gemini") {
      const k = await getApiKey("gemini");
      if (!k) return null;
      return await callGemini({ apiKey: k, ...opts, max, temperature, timeoutMs });
    }
    if (active === "groq") {
      const k = await getApiKey("groq");
      if (!k) return null;
      return await callOpenAICompat({
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: k,
        model: "llama-3.3-70b-versatile",
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    }
    if (active === "anthropic") {
      const k = await getApiKey("anthropic");
      if (!k) return null;
      return await callAnthropic({ apiKey: k, ...opts, max, temperature, timeoutMs });
    }
    if (active === "openai") {
      const k = await getApiKey("openai");
      if (!k) return null;
      return await callOpenAICompat({
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey: k,
        model: "gpt-4o-mini",
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    }
    if (active === "openrouter") {
      const k = await getApiKey("openrouter");
      if (!k) return null;
      return await callOpenAICompat({
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: k,
        model: "meta-llama/llama-3.3-70b-instruct:free",
        extraHeaders: { "x-title": "SEO Tool" },
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    }
    if (active === "perplexity") {
      const k = await getApiKey("perplexity");
      if (!k) return null;
      return await callOpenAICompat({
        endpoint: "https://api.perplexity.ai/chat/completions",
        apiKey: k,
        model: "sonar",
        ...opts,
        max,
        temperature,
        timeoutMs,
      });
    }
    if (active === "ollama") {
      const url = await getOllamaUrl();
      return await callOllama({ url, ...opts, max, temperature, timeoutMs });
    }
  } catch {
    return null;
  }
  return null;
}

type CallArgs = AiCallOptions & {
  apiKey?: string;
  max: number;
  temperature: number;
  timeoutMs: number;
};

async function callGemini(args: CallArgs): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(args.apiKey ?? "")}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), args.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: c.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${args.system}\n\n${args.user}` }],
          },
        ],
        generationConfig: {
          maxOutputTokens: args.max,
          temperature: args.temperature,
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() || null
    );
  } finally {
    clearTimeout(t);
  }
}

async function callAnthropic(args: CallArgs): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), args.timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: c.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": args.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: args.max,
        temperature: args.temperature,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
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
        .join("")
        .trim() || null
    );
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAICompat(args: CallArgs & {
  endpoint: string;
  model: string;
  extraHeaders?: Record<string, string>;
}): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), args.timeoutMs);
  try {
    const res = await fetch(args.endpoint, {
      method: "POST",
      signal: c.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${args.apiKey ?? ""}`,
        ...(args.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: args.max,
        temperature: args.temperature,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } finally {
    clearTimeout(t);
  }
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
        model: "llama3.2",
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
