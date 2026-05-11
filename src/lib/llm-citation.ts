/**
 * AI visibility tracking — runs a tracked query through one or more LLM
 * providers and detects if the user's domain is mentioned in the response,
 * plus extracts any URLs/domains the LLM cited.
 *
 * Free providers prioritised (Gemini, Groq, Perplexity, OpenRouter, Ollama).
 */
import { getApiKey, getOllamaUrl, type Provider } from "./api-keys";
import { callGemini as sharedCallGemini } from "./providers/gemini";
import { callAnthropic as sharedCallAnthropic } from "./providers/anthropic";
import { callOpenAICompat as sharedCallOpenAICompat } from "./providers/openai-compat";

export type LlmProvider = Provider | "ollama";

export type CitationCheckResult = {
  provider: LlmProvider;
  prompt: string;
  response: string;
  citations: string[]; // URLs or domains the LLM cited
  mentionsDomain: boolean;
  citationsForDomain: number;
  error?: string;
};

const PROMPT_TEMPLATE = `Provide a thorough, factual answer to this question. Cite specific source URLs where you can — write them inline as plain http(s):// URLs. Avoid speculation.

Question: {{query}}`;

function buildPrompt(query: string): string {
  return PROMPT_TEMPLATE.replace("{{query}}", query);
}

function normaliseDomain(raw: string): string {
  return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s)\]"'<>]+/gi;
  const matches = text.match(re) ?? [];
  const out = new Set<string>();
  for (const m of matches) {
    // Strip trailing punctuation Markdown often adds
    const cleaned = m.replace(/[.,;:!?]+$/, "");
    out.add(cleaned);
  }
  return Array.from(out);
}

function domainsFromUrls(urls: string[]): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    try {
      out.add(new URL(u).hostname.replace(/^www\./i, "").toLowerCase());
    } catch {
      // ignore malformed
    }
  }
  return Array.from(out);
}

function countDomainMentions(text: string, domain: string): number {
  if (!domain) return 0;
  const norm = normaliseDomain(domain);
  if (!norm) return 0;
  // Match either the bare domain or a URL to it
  const re = new RegExp(`(?:https?://)?(?:www\\.)?${norm.replace(/\./g, "\\.")}`, "gi");
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

// ── Provider implementations ──────────────────────────────────────────────

async function callAnthropic(
  apiKey: string,
  prompt: string,
): Promise<string | null> {
  return sharedCallAnthropic({
    apiKey,
    system: "",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1500,
    temperature: 0.2,
    timeoutMs: 30_000,
    caller: "llm-citation",
  });
}

async function callOpenAI(
  apiKey: string,
  prompt: string,
): Promise<string | null> {
  return sharedCallOpenAICompat({
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKey,
    model: "gpt-4o-mini",
    system: "",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1500,
    temperature: 0.2,
    timeoutMs: 30_000,
    caller: "llm-citation",
  });
}

async function callGemini(
  apiKey: string,
  prompt: string,
): Promise<string | null> {
  return sharedCallGemini({
    apiKey,
    system: "",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1500,
    temperature: 0.2,
    timeoutMs: 30_000,
    caller: "llm-citation",
  });
}

async function callPerplexity(
  apiKey: string,
  prompt: string,
): Promise<{ text: string; citations: string[] } | null> {
  // Sonar models return native citations.
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 30_000);
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      signal: c.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "sonar",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      citations?: string[];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    const citations = Array.isArray(data.citations) ? data.citations : [];
    if (!text) return null;
    return { text, citations };
  } finally {
    clearTimeout(t);
  }
}

async function callOpenRouter(
  apiKey: string,
  prompt: string,
): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 30_000);
  try {
    const res = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal: c.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "x-title": "SEO Tool",
        },
        body: JSON.stringify({
          // Free model — Llama 3.3 free tier on OpenRouter.
          model: "meta-llama/llama-3.3-70b-instruct:free",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
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

async function callGroq(
  apiKey: string,
  prompt: string,
): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 30_000);
  try {
    const res = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        signal: c.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1500,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
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

async function callOllama(
  baseUrl: string,
  prompt: string,
): Promise<string | null> {
  const models = ["llama3.2", "llama3.1", "mistral", "phi3"];
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 60_000);
  try {
    for (const model of models) {
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          signal: c.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            message?: { content?: string };
          };
          const text = data.message?.content?.trim();
          if (text) return text;
        }
      } catch {
        /* try next model */
      }
    }
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function checkOneProvider(
  provider: LlmProvider,
  query: string,
  domain: string,
): Promise<CitationCheckResult> {
  const prompt = buildPrompt(query);

  let response: string | null = null;
  let nativeCitations: string[] = [];
  let error: string | undefined;

  try {
    if (provider === "ollama") {
      const url = await getOllamaUrl();
      response = await callOllama(url, prompt);
    } else if (provider === "perplexity") {
      const key = await getApiKey("perplexity");
      if (!key) {
        error = "No Perplexity API key configured";
      } else {
        const r = await callPerplexity(key, prompt);
        if (r) {
          response = r.text;
          nativeCitations = r.citations;
        }
      }
    } else if (provider === "anthropic") {
      const key = await getApiKey("anthropic");
      if (!key) error = "No Anthropic API key configured";
      else response = await callAnthropic(key, prompt);
    } else if (provider === "openai") {
      const key = await getApiKey("openai");
      if (!key) error = "No OpenAI API key configured";
      else response = await callOpenAI(key, prompt);
    } else if (provider === "gemini") {
      const key = await getApiKey("gemini");
      if (!key) error = "No Gemini API key configured";
      else response = await callGemini(key, prompt);
    } else if (provider === "openrouter") {
      const key = await getApiKey("openrouter");
      if (!key) error = "No OpenRouter API key configured";
      else response = await callOpenRouter(key, prompt);
    } else if (provider === "groq") {
      const key = await getApiKey("groq");
      if (!key) error = "No Groq API key configured";
      else response = await callGroq(key, prompt);
    }
  } catch (err) {
    error = (err as Error).message;
  }

  if (!response) {
    return {
      provider,
      prompt,
      response: "",
      citations: [],
      mentionsDomain: false,
      citationsForDomain: 0,
      error: error ?? "No response from provider",
    };
  }

  // Combine native citations + extracted URLs
  const extractedUrls = extractUrls(response);
  const allCitationsArr = Array.from(
    new Set([...nativeCitations, ...extractedUrls]),
  );

  // For text-mention check, count any reference to the user's domain (URL or bare).
  const mentionCount = countDomainMentions(response, domain);

  // Citations for the user's domain — count among the citations array
  const targetDomain = normaliseDomain(domain);
  const allCitationDomains = domainsFromUrls(allCitationsArr);
  const citationsForDomain = allCitationDomains.filter(
    (d) => d === targetDomain || d.endsWith("." + targetDomain),
  ).length;

  return {
    provider,
    prompt,
    response,
    citations: allCitationsArr,
    mentionsDomain: mentionCount > 0,
    citationsForDomain,
  };
}

export async function checkAllProviders(
  query: string,
  domain: string,
  providers: LlmProvider[],
): Promise<CitationCheckResult[]> {
  // Run in parallel — different providers don't share rate limits.
  const results = await Promise.all(
    providers.map((p) => checkOneProvider(p, query, domain)),
  );
  return results;
}
