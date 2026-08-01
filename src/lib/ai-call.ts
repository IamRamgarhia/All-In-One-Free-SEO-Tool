import { getActiveProvider, getApiKey, getOllamaUrl } from "./api-keys";
import { getSetting } from "./settings-store";
import { checkMonthlyCap, logAiCall } from "./ai-usage";

// Cap how much of the user/system prompt we persist to ai_usage_log.
// Full prompts may contain pasted API keys, OAuth tokens, or other
// secrets — and the ai_usage_log table is NOT encrypted at rest.
// A short preview is enough for debugging without becoming a credential
// leak vector if data.db is ever backed up to an untrusted location.
const LOG_PROMPT_PREVIEW_CHARS = 300;
function logPreview(text: string): string {
  if (typeof text !== "string") return "";
  if (text.length <= LOG_PROMPT_PREVIEW_CHARS) return text;
  return text.slice(0, LOG_PROMPT_PREVIEW_CHARS) + "... (truncated)";
}
import { withAiPermit } from "./ai-semaphore";
import { dispatchProviderCall, defaultModelFor } from "./provider-dispatch";
import { estimateTokens } from "./ai-cost";
import {
  classifyProviderError,
  emptyResponseFailure,
  monthlyCapFailure,
  noProviderFailure,
  type AiFailure,
  type AiResult,
} from "./ai-error";

export type AiFeatureName =
  | "exec_summary"
  | "blog_draft"
  | "title_rewrite"
  | "meta_rewrite"
  | "review_reply"
  | "content_idea"
  | "ai_sentiment"
  | "geo_swot"
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
/**
 * Back-compat shim. Returns the text, or null on any failure.
 *
 * Prefer `callAIResult` for anything user-facing: this signature is
 * exactly the problem the audit found — every failure mode (no key,
 * retired model, spend cap, timeout, provider 500) collapsed into the
 * same `null`, and all 68 call sites rendered the same empty box.
 */
export async function callAI(opts: AiCallOptions): Promise<string | null> {
  const r = await callAIResult(opts);
  return r.ok ? r.text : null;
}

/**
 * The real entry point. Always resolves; on failure carries a reason
 * code plus a sentence naming the fix and a link to the setting.
 */
export async function callAIResult(opts: AiCallOptions): Promise<AiResult> {
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
  if (!active) return { ok: false, failure: noProviderFailure() };

  // Enforce monthly cap if set
  const cap = await checkMonthlyCap();
  if (cap.capped) {
    void logAiCall({
      feature: opts.feature ?? "general",
      provider: active,
      model: null,
      promptText: logPreview(opts.user),
      completionText: null,
      status: "blocked_by_cap",
      errorMsg: `Monthly AI cap of $${cap.capUsd?.toFixed(2)} reached.`,
      clientId: opts.clientId ?? null,
    });
    return { ok: false, failure: monthlyCapFailure(cap.capUsd ?? null) };
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

  // Wrap dispatch with logging — each path returns (text, model)
  const start = Date.now();
  let model: string | null = null;
  let text: string | null = null;
  let errorMsg: string | undefined;

  const pickedModel = opts.modelOverride?.trim() || defaultModelFor(active);

  // Captured by the dispatch layer when a provider rejects the call.
  // Without this, a retired model id, a bad key, and a network blip all
  // arrived at the UI as the same nothing.
  let providerError: { status: number; body: string } | null = null;

  // Acquire one of the global AI permits. Caps workspace-wide
  // concurrency so the daily-agent's batch generations don't burst
  // the provider's rate limit and break a manual user action that
  // happens to fire at the same moment. Permits are auto-released
  // in finally even when the dispatch throws.
  await withAiPermit(async () => {
    try {
      // Single dispatch call — every provider (gemini, anthropic, openai,
      // groq, openrouter, perplexity, ollama, mistral, deepseek, cerebras,
      // together, github) is defined in provider-dispatch.ts. Adding a new
      // provider means one registry entry, not a new branch here.
      model = pickedModel;
      text = await dispatchProviderCall(active!, {
        system,
        user: safeUser,
        model: pickedModel,
        maxTokens: max,
        temperature,
        timeoutMs,
        caller: "ai-call",
        onFailure: (status, body) => {
          providerError = { status, body };
        },
      });
    } catch (err) {
      errorMsg = (err as Error).message;
      text = null;
    }
  });

  // Resolve the failure BEFORE logging so ai_usage_log records the same
  // human-readable reason the user was shown — makes Settings → AI usage
  // a usable debugging surface instead of a wall of nulls.
  const failure: AiFailure | null = text
    ? null
    : providerError
      ? classifyProviderError(
          (providerError as { status: number; body: string }).status,
          (providerError as { status: number; body: string }).body,
          { provider: active, model: pickedModel },
        )
      : errorMsg
        ? classifyProviderError(0, errorMsg, {
            provider: active,
            model: pickedModel,
          })
        : emptyResponseFailure(active, pickedModel);

  // Log every call (success or failure) — async-fire, never block.
  //
  // promptTokens is estimated from `opts.user` at full length, not the
  // 300-char logging preview. Estimating from the preview under-counted
  // prompt tokens by orders of magnitude, so spend tracking and the
  // monthly cap were both computed from a number that had no relation
  // to what was actually sent.
  void logAiCall({
    feature: opts.feature ?? "general",
    provider: active,
    model,
    promptText: logPreview(`${system}\n\n${opts.user}`),
    promptTokens: estimateTokens(`${system}\n\n${safeUser}`),
    completionText: text,
    latencyMs: Date.now() - start,
    clientId: opts.clientId ?? null,
    status: text ? "ok" : "error",
    errorMsg: failure?.message ?? errorMsg,
  });

  if (text) return { ok: true, text };
  return { ok: false, failure: failure ?? emptyResponseFailure(active, pickedModel) };
}

// Provider-specific callers moved to src/lib/provider-dispatch.ts.
// Everything above this line goes through dispatchProviderCall().
