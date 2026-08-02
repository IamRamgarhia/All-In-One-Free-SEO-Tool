/**
 * Turning AI provider failures into something a user can act on.
 *
 * `callAI` used to return `null` for every failure mode: no key
 * configured, retired model id, monthly cap reached, network down,
 * provider 500, bad request, timeout. All 68 call sites got the same
 * `null` and rendered the same empty box, so a user whose model preset
 * had been retired upstream saw "generate" do nothing, forever, with no
 * hint that the fix was one dropdown away.
 *
 * Every failure now carries a `reason` code and a sentence naming the
 * specific fix. That single change moves perceived quality more than
 * any new feature, because it converts a dead end into a next step.
 */

export type AiFailureReason =
  | "no_provider"
  | "no_key"
  | "no_ollama_url"
  | "bad_key"
  | "unknown_model"
  | "rate_limited"
  | "quota_exceeded"
  | "monthly_cap"
  | "timeout"
  | "network"
  | "provider_error"
  | "bad_request"
  | "empty_response";

export type AiFailure = {
  reason: AiFailureReason;
  /** One sentence, plain language, naming the fix. Safe to show a user. */
  message: string;
  /** Provider/model in play, when known — helps the user find the setting. */
  provider?: string | null;
  model?: string | null;
  /** HTTP status, when the failure came from a provider response. */
  status?: number;
  /** Where the user goes to fix it. */
  fixHref?: string;
};

export type AiResult =
  | { ok: true; text: string }
  | { ok: false; failure: AiFailure };

/**
 * Sentinel "statuses" for failures that happen before any HTTP request
 * is made. Negative so they can never collide with a real status code,
 * which lets one `onFailure(status, body)` channel carry both
 * config problems and provider responses.
 */
export const NO_KEY_STATUS = -1;
export const NO_OLLAMA_URL_STATUS = -2;

/**
 * Map an HTTP status + response body to a reason and a fix.
 *
 * The body matters: providers reuse 400 for "this model doesn't exist"
 * and "your prompt is malformed", and those need different advice. A
 * retired model id is by far the most common cause in practice, so we
 * look for it explicitly rather than showing a generic "bad request".
 */
export function classifyProviderError(
  status: number,
  body: string,
  ctx: { provider?: string | null; model?: string | null } = {},
): AiFailure {
  const b = (body ?? "").toLowerCase();
  const model = ctx.model ?? null;
  const provider = ctx.provider ?? null;
  const base = { provider, model, status };

  if (status === NO_KEY_STATUS) {
    return { ...base, ...noKeyFailure(provider ?? "this provider") };
  }
  if (status === NO_OLLAMA_URL_STATUS) {
    return { ...base, ...noOllamaUrlFailure() };
  }

  // Gemini surfaces its failures as a single aggregated string rather
  // than a status, so classify from the text when we have no code.
  if (status === 0 && /timed out|timeout|aborted/i.test(b)) {
    return {
      ...base,
      reason: "timeout",
      message: `${provider ?? "The AI provider"} didn't respond in time. Try again, or pick a faster model in Settings → AI.`,
      fixHref: "/settings#ai",
    };
  }

  if (status === 0) {
    return {
      ...base,
      reason: "network",
      message: `Couldn't reach ${provider ?? "the AI provider"} — check your internet connection and try again.`,
    };
  }

  if (status === 401 || status === 403) {
    return {
      ...base,
      reason: "bad_key",
      message: `${provider ?? "The provider"} rejected your API key. Paste a fresh key in Settings → AI.`,
      fixHref: "/settings#ai",
    };
  }

  // A retired or mistyped model id. Providers are inconsistent about
  // the status (404 from OpenAI/Google, 400 from some gateways), so
  // match on the body text too.
  const looksLikeModelProblem =
    /model|not found|does not exist|decommissioned|deprecated|unsupported/.test(
      b,
    );
  if (status === 404 || (status === 400 && looksLikeModelProblem)) {
    return {
      ...base,
      reason: "unknown_model",
      message: model
        ? `${provider ?? "The provider"} doesn't recognise the model "${model}" — it may have been retired. Pick a different model in Settings → AI.`
        : `${provider ?? "The provider"} rejected the requested model. Pick a different model in Settings → AI.`,
      fixHref: "/settings#ai",
    };
  }

  if (status === 429) {
    // Free tiers return 429 for both "too fast" and "out of quota for
    // the month" — the advice differs, so read the body.
    const outOfQuota = /quota|billing|credit|insufficient|exceeded your/.test(b);
    return {
      ...base,
      reason: outOfQuota ? "quota_exceeded" : "rate_limited",
      message: outOfQuota
        ? `Your ${provider ?? "provider"} quota is used up. Wait for it to reset, add billing, or switch providers in Settings → AI.`
        : `${provider ?? "The provider"} is rate-limiting requests. Wait a moment and try again.`,
      fixHref: outOfQuota ? "/settings#ai" : undefined,
    };
  }

  if (status === 413 || /context length|too long|maximum context/.test(b)) {
    return {
      ...base,
      reason: "bad_request",
      message:
        "That request was too long for the model. Try a shorter page, or a model with a bigger context window.",
      fixHref: "/settings#ai",
    };
  }

  if (status >= 500) {
    return {
      ...base,
      reason: "provider_error",
      message: `${provider ?? "The AI provider"} returned an error (${status}). This is usually temporary — try again shortly.`,
    };
  }

  if (status === 400) {
    return {
      ...base,
      reason: "bad_request",
      message: `${provider ?? "The provider"} rejected the request${body ? `: ${body.slice(0, 120)}` : "."}`,
    };
  }

  return {
    ...base,
    reason: "provider_error",
    message: `${provider ?? "The AI provider"} returned an unexpected error (${status}).`,
  };
}

/** No provider configured at all — the first-run state. */
export function noProviderFailure(): AiFailure {
  return {
    reason: "no_provider",
    message:
      "No AI provider is set up yet. Add a free Gemini or Groq key in Settings → AI to turn this on.",
    fixHref: "/settings#ai",
  };
}

export function noKeyFailure(provider: string): AiFailure {
  return {
    reason: "no_key",
    provider,
    message: `No API key saved for ${provider}. Add one in Settings → AI, or switch to a provider you have a key for.`,
    fixHref: "/settings#ai",
  };
}

export function noOllamaUrlFailure(): AiFailure {
  return {
    reason: "no_ollama_url",
    provider: "ollama",
    message:
      "Ollama is selected but no server URL is set. Add it in Settings → AI (usually http://localhost:11434).",
    fixHref: "/settings#ai",
  };
}

export function monthlyCapFailure(capUsd: number | null): AiFailure {
  return {
    reason: "monthly_cap",
    message: capUsd
      ? `Your monthly AI spend cap of $${capUsd.toFixed(2)} has been reached. Raise it in Settings → AI, or wait for next month.`
      : "Your monthly AI spend cap has been reached. Raise it in Settings → AI.",
    fixHref: "/settings#ai",
  };
}

export function timeoutFailure(provider: string | null, ms: number): AiFailure {
  return {
    reason: "timeout",
    provider,
    message: `${provider ?? "The AI provider"} didn't respond within ${Math.round(ms / 1000)}s. Try again, or pick a faster model in Settings → AI.`,
    fixHref: "/settings#ai",
  };
}

export function emptyResponseFailure(
  provider: string | null,
  model: string | null,
): AiFailure {
  return {
    reason: "empty_response",
    provider,
    model,
    message: `${provider ?? "The provider"} returned an empty response. Try again, or switch models in Settings → AI.`,
    fixHref: "/settings#ai",
  };
}

/**
 * Fallback text for a UI that only has somewhere to put a string.
 * Prefer rendering `failure.message` plus a link to `failure.fixHref`.
 */
export function aiFailureText(failure: AiFailure | null | undefined): string {
  return failure?.message ?? "The AI request failed. Check Settings → AI.";
}
