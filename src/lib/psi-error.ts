/**
 * What went wrong with PageSpeed Insights, in a sentence, plus where to
 * go and fix it.
 *
 * Seven tools call PSI — compare, cwv, geo-score, health-check,
 * perf-budget, sxo and local-cwv — through two clients that produced two
 * different unreadable strings: `PageSpeed API 429` from pagespeed.ts and
 * a 200-character slice of raw Google JSON from local-cwv-psi.ts. The
 * second is what a user actually saw:
 *
 *   PSI 429: { "error": { "code": 429, "message": "Quota exceeded for
 *   quota metric 'Queries' and limit 'Queries per day' of service
 *   'pagespeedonline.googleapis.com' for consumer 'project_number:583…
 *
 * That is Google's own shared anonymous project, not the user's. Without
 * a key every install on earth draws from the same daily bucket, so the
 * DEFAULT path fails for everybody who has not added one — on a tool
 * whose name is "no PSI key". The message did not say that, did not say
 * a key is free, and did not say the tool has a local mode that needs no
 * key at all.
 *
 * One translator, so both clients say the same thing and neither can go
 * back to printing JSON at somebody.
 */

import { INTEGRATIONS } from "./integrations";

export type PsiFailure = {
  /** One sentence, plain language, no JSON. */
  message: string;
  /** Where the fix is, when there is one. */
  fixHref: string | null;
  /** Label for the button to that fix. */
  fixLabel: string | null;
  /**
   * Whether measuring locally instead would work. Quota and auth
   * problems are ours to route around; a URL that does not load is not.
   */
  retryLocally: boolean;
};

/**
 * Where the PageSpeed key is entered, taken from the integrations table
 * rather than typed again here. That table already carries the route and
 * the button label for every key in the app; a second copy of them would
 * be the fourth hardcoded list of the same thing in this codebase, and
 * every previous pair had already drifted by the time it was found.
 */
const PSI = INTEGRATIONS.find((i) => i.id === "pagespeed");
const KEY_SETTINGS_HREF = PSI?.setupHref ?? "/settings#ai";
const KEY_SETTINGS_LABEL = PSI?.setupLabel ?? "Add a PageSpeed key";

/**
 * Classify an HTTP failure from the PSI endpoint.
 *
 * `body` is Google's response text. It is inspected but never shown —
 * the whole point is that the caller stops forwarding it.
 */
export function psiHttpFailure(status: number, body = ""): PsiFailure {
  const quota = /quota|rate limit|rateLimitExceeded/i.test(body);

  if (status === 429 || (status === 403 && quota)) {
    return {
      message:
        "Google's free PageSpeed quota is used up for today. Without a key " +
        "every install shares one small daily allowance. Your own key is " +
        "free and raises it to 25,000 checks a day.",
      fixHref: KEY_SETTINGS_HREF,
      fixLabel: KEY_SETTINGS_LABEL,
      retryLocally: true,
    };
  }

  if (status === 403 || status === 401) {
    return {
      message:
        "Google rejected the PageSpeed key. It may be the wrong key, or the " +
        "PageSpeed Insights API may not be enabled on that Google Cloud project.",
      fixHref: KEY_SETTINGS_HREF,
      fixLabel: "Check the PageSpeed key",
      retryLocally: true,
    };
  }

  if (status === 400) {
    return {
      message:
        "Google could not test that URL. It usually means the page did not " +
        "load for them — check the address, and that the site is reachable " +
        "from the public internet.",
      fixHref: null,
      fixLabel: null,
      // A URL Google cannot reach is not something local mode fixes.
      retryLocally: false,
    };
  }

  if (status >= 500) {
    return {
      message:
        "Google's PageSpeed service is having trouble right now. This is on " +
        "their side and usually clears within a few minutes.",
      fixHref: null,
      fixLabel: null,
      retryLocally: true,
    };
  }

  return {
    message: `Google's PageSpeed service returned an unexpected error (${status}).`,
    fixHref: null,
    fixLabel: null,
    retryLocally: true,
  };
}

/** A network-level failure — DNS, TLS, timeout, offline. */
export function psiNetworkFailure(err: unknown): PsiFailure {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const timedOut = /timeout|abort|timed out/i.test(raw);
  return {
    message: timedOut
      ? "The PageSpeed check took too long and was stopped. Slow pages often " +
        "hit this; measuring locally is usually more patient."
      : "Could not reach Google's PageSpeed service. Check this machine's " +
        "internet connection.",
    fixHref: null,
    fixLabel: null,
    retryLocally: true,
  };
}

/**
 * Google sometimes answers 200 with an error object in the body. Same
 * treatment — the raw message is inspected, never forwarded.
 */
export function psiBodyFailure(body: {
  error?: { code?: number; message?: string };
}): PsiFailure {
  const code = body.error?.code;
  if (typeof code === "number") {
    return psiHttpFailure(code, body.error?.message ?? "");
  }
  return {
    message: "Google's PageSpeed service could not complete that check.",
    fixHref: null,
    fixLabel: null,
    retryLocally: true,
  };
}
