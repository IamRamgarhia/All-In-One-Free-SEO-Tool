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
import { scrapeGoogleAiMode, scrapeCopilot } from "./ai-search-scrapers";

/**
 * All the AI-search surfaces we can track. Split into two categories:
 *   - API providers (Provider from ./api-keys, plus "ollama"): call
 *     the vendor API with the user's key
 *   - Browser-scraped surfaces ("google_ai_mode", "copilot"): no
 *     public API — we drive a headless browser through the product's
 *     web UI and extract the response
 * Both flow through the same checkOneProvider() dispatch.
 */
export type LlmProvider = Provider | "ollama" | "google_ai_mode" | "copilot";

/**
 * How a provider produced its answer. This is THE thing that decides
 * whether a result means anything.
 *
 * A plain chat-completions call does not search the web. It answers
 * from training data and will happily invent plausible-looking source
 * URLs — which we were then parsing as "citations" and scoring. That
 * made the headline AI-visibility number a measurement of what a model
 * remembers, not of what AI search actually shows, and it silently
 * over-reported: a model that hallucinated your URL counted as a win.
 *
 *   "live"     — real retrieval: the provider searched the web for this
 *                answer and the citations are real fetched sources.
 *   "memory"   — no retrieval. Reflects training data, months stale,
 *                and any URLs in it are unverified.
 */
export type GroundingMode = "live" | "memory";

export const PROVIDER_GROUNDING: Record<LlmProvider, GroundingMode> = {
  // Native web search built into the sonar models.
  perplexity: "live",
  // Grounded below via the google_search tool.
  gemini: "live",
  // Grounded below via the web_search server tool.
  anthropic: "live",
  // Real products, driven through their web UI by the browser pool.
  google_ai_mode: "live",
  copilot: "live",
  // Chat-completions only, no retrieval. Kept because they're free and
  // still show what a model "believes" about a brand — but labelled.
  openai: "memory",
  openrouter: "memory",
  groq: "memory",
  ollama: "memory",
  mistral: "memory",
  deepseek: "memory",
  cerebras: "memory",
  together: "memory",
  github: "memory",
};

export type CitationCheckResult = {
  provider: LlmProvider;
  prompt: string;
  response: string;
  citations: string[]; // URLs or domains the LLM cited
  mentionsDomain: boolean;
  citationsForDomain: number;
  /**
   * Whether this answer came from live retrieval or model memory.
   * Render it — a "memory" result is not evidence of AI-search
   * visibility and must not be presented as though it were.
   */
  grounding: GroundingMode;
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

/**
 * Anthropic WITH the web_search server tool, so the answer reflects a
 * real search rather than training data. Anthropic runs the search
 * server-side and returns the sources it used, which we read as real
 * citations instead of scraping URLs out of prose.
 *
 * Falls back to an ungrounded call if the tool isn't available to this
 * key — the caller downgrades `grounding` to "memory" so the UI stays
 * honest about what it measured.
 */
async function callAnthropicGrounded(
  apiKey: string,
  prompt: string,
): Promise<{ text: string; citations: string[]; grounded: boolean } | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 60_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: c.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1500,
        tools: [{ type: "web_search_20260209", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        content?: {
          type: string;
          text?: string;
          content?: { type: string; url?: string }[];
        }[];
      };
      const text = (data.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
        .trim();
      // Sources actually fetched during the search, not URLs the model
      // wrote into prose.
      const citations: string[] = [];
      for (const block of data.content ?? []) {
        if (block.type !== "web_search_tool_result") continue;
        for (const r of block.content ?? []) {
          if (r.url) citations.push(r.url);
        }
      }
      if (text) return { text, citations, grounded: true };
    }

    // Tool unsupported on this key/plan — fall back, but say so.
    const text = await sharedCallAnthropic({
      apiKey,
      system: "",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1500,
      temperature: 0.2,
      timeoutMs: 30_000,
      caller: "llm-citation",
    });
    return text ? { text, citations: [], grounded: false } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
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

/**
 * Gemini WITH the google_search grounding tool.
 *
 * This is the one that matters most for AI visibility: grounded Gemini
 * is what actually backs Google's AI surfaces, so an ungrounded call
 * here was measuring the wrong system entirely. Grounded responses come
 * back with `groundingMetadata`, which gives us the real source URLs
 * rather than whatever the model typed.
 */
async function callGeminiGrounded(
  apiKey: string,
  prompt: string,
): Promise<{ text: string; citations: string[]; grounded: boolean } | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 60_000);
  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` +
      `?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      signal: c.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.2 },
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          groundingMetadata?: {
            groundingChunks?: { web?: { uri?: string; title?: string } }[];
          };
        }[];
      };
      const cand = data.candidates?.[0];
      const text =
        cand?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim() ?? "";
      const citations = (cand?.groundingMetadata?.groundingChunks ?? [])
        .map((ch) => ch.web?.uri)
        .filter((u): u is string => Boolean(u));
      if (text) {
        // No grounding metadata means Gemini chose not to search for
        // this query — the answer is from memory even though we asked.
        return { text, citations, grounded: citations.length > 0 };
      }
    }

    const text = await sharedCallGemini({
      apiKey,
      system: "",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1500,
      temperature: 0.2,
      timeoutMs: 30_000,
      caller: "llm-citation",
    });
    return text ? { text, citations: [], grounded: false } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
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
  // Starts from the provider's declared capability, then downgrades if
  // the grounded path didn't actually retrieve anything for this query.
  let grounding: GroundingMode = PROVIDER_GROUNDING[provider] ?? "memory";

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
      else {
        const r = await callAnthropicGrounded(key, prompt);
        if (r) {
          response = r.text;
          nativeCitations = r.citations;
          if (!r.grounded) grounding = "memory";
        }
      }
    } else if (provider === "openai") {
      const key = await getApiKey("openai");
      if (!key) error = "No OpenAI API key configured";
      else response = await callOpenAI(key, prompt);
    } else if (provider === "gemini") {
      const key = await getApiKey("gemini");
      if (!key) error = "No Gemini API key configured";
      else {
        const r = await callGeminiGrounded(key, prompt);
        if (r) {
          response = r.text;
          nativeCitations = r.citations;
          if (!r.grounded) grounding = "memory";
        }
      }
    } else if (provider === "openrouter") {
      const key = await getApiKey("openrouter");
      if (!key) error = "No OpenRouter API key configured";
      else response = await callOpenRouter(key, prompt);
    } else if (provider === "groq") {
      const key = await getApiKey("groq");
      if (!key) error = "No Groq API key configured";
      else response = await callGroq(key, prompt);
    } else if (provider === "google_ai_mode") {
      // Browser-scraped — no API key needed. Uses the headless
      // browser pool with proxy rotation. Slower than API providers
      // (~15-20s vs 2-5s) but genuinely covers Google's own AI Mode.
      const r = await scrapeGoogleAiMode(query);
      if (r.ok) {
        response = r.text;
        nativeCitations = r.citations;
      } else {
        error = r.error ?? "Google AI Mode scrape failed";
      }
    } else if (provider === "copilot") {
      const r = await scrapeCopilot(query);
      if (r.ok) {
        response = r.text;
        nativeCitations = r.citations;
      } else {
        error = r.error ?? "Microsoft Copilot scrape failed";
      }
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
      grounding,
      error: error ?? "No response from provider",
    };
  }

  // Native citations are real fetched sources. URLs scraped out of prose
  // are only trustworthy when the provider actually searched — an
  // ungrounded model invents plausible URLs, and counting those was how
  // a hallucinated mention became a reported "win".
  const extractedUrls = grounding === "live" ? extractUrls(response) : [];
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
    grounding,
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
