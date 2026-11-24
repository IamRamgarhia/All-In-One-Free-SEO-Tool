/**
 * Why a rank source gave no answer, as data rather than prose.
 *
 * Every source used to report failure as an English sentence, and those
 * sentences reached the screen as they were: a "✕" with an English
 * tooltip in a French interface. A code plus a few facts (which engine,
 * which HTTP status, how many results were read before the block) lets
 * the interface say it in the reader's language, and lets the history
 * keep a failure without freezing the wording of the day.
 *
 * A failure is never "not ranking". That conflation is the bug this
 * codebase keeps finding: a blocked check recorded as a position drop.
 */

import type { CaptchaResult } from "../captcha-detect";

/** The engine that actually answered (or failed to). */
export type RankEngine =
  | "gsc"
  | "searxng"
  | "brave"
  | "api"
  | "google"
  | "duckduckgo";

export const RANK_ENGINES: readonly RankEngine[] = [
  "gsc",
  "searxng",
  "brave",
  "api",
  "google",
  "duckduckgo",
];

export function isRankEngine(value: unknown): value is RankEngine {
  return typeof value === "string" && (RANK_ENGINES as readonly string[]).includes(value);
}

export type RankFailureCode =
  /** A captcha or "are you human" page instead of results. */
  | "blocked"
  /** A cookie-consent wall instead of results. */
  | "consent"
  /** HTTP 429 or the engine's own rate-limit page. */
  | "rateLimited"
  /** A page with no result we could read and no "no results" notice. */
  | "unreadable"
  /** Blocked part-way: some results read, the domain not among them. */
  | "truncated"
  /** Not reached at all (DNS, refused, timeout). */
  | "network"
  /** Reached, answered with an unexpected HTTP status. */
  | "http"
  /** Rank checking by browser switched off (lean mode). */
  | "disabled"
  /** The headless browser is not installed on this machine. */
  | "browserMissing"
  /** The configured address or credentials are not usable. */
  | "badConfig"
  /** SearXNG answered HTML: `json` is missing from search.formats. */
  | "jsonDisabled"
  /** The source answered with no results at all. */
  | "noResults"
  /** The API rejected the key. */
  | "badKey"
  /** Google was skipped for the rest of a batch after blocking us. */
  | "skipped"
  /** The domain to look for is empty. */
  | "emptyDomain"
  | "unknown";

export type RankFailure = {
  engine: RankEngine;
  code: RankFailureCode;
  /** HTTP status, for `http`. */
  status?: number;
  /** Results read before the block, for `truncated`. */
  scanned?: number;
  /**
   * Raw technical detail (an exception message, a provider's own
   * wording). Kept for logs and the history; never the main message.
   */
  detail?: string;
};

/** Map the shared captcha detector's verdict to a failure code. */
export function failureFromCaptcha(
  engine: RankEngine,
  reason: CaptchaResult["reason"],
): RankFailure {
  switch (reason) {
    case "google_consent":
      return { engine, code: "consent" };
    case "rate_limit":
      return { engine, code: "rateLimited" };
    case null:
      return { engine, code: "unreadable" };
    default:
      return { engine, code: "blocked", detail: reason };
  }
}

/** Map a thrown error to a failure code, recognising the common ones. */
export function failureFromError(engine: RankEngine, err: unknown): RankFailure {
  const message = err instanceof Error ? err.message : String(err);
  if (/headless browser isn't installed|executable doesn't exist/i.test(message)) {
    return { engine, code: "browserMissing", detail: message };
  }
  if (/abort|timeout|timed out|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|fetch failed|net::ERR/i.test(message)) {
    return { engine, code: "network", detail: message };
  }
  return { engine, code: "unknown", detail: message };
}

/**
 * The failures worth telling the user about.
 *
 * "skipped" is a consequence, not a cause: a batch stops asking Google
 * after Google blocked it once, and the block itself is reported on the
 * keyword where it happened.
 */
export function significantFailures(failures: readonly RankFailure[]): RankFailure[] {
  const out = failures.filter((f) => f.code !== "skipped");
  return out.length > 0 ? out : [...failures];
}

/** True when this failure means "Google refuses this server right now". */
export function isGoogleBlock(f: RankFailure): boolean {
  return (
    f.engine === "google" &&
    (f.code === "blocked" || f.code === "consent" || f.code === "rateLimited" || f.code === "truncated")
  );
}

/** Parse the JSON stored in keyword_rank_failures.failures, defensively. */
export function parseStoredFailures(raw: unknown): RankFailure[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: RankFailure[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const f = v as Record<string, unknown>;
    if (!isRankEngine(f.engine) || typeof f.code !== "string") continue;
    out.push({
      engine: f.engine,
      code: f.code as RankFailureCode,
      ...(typeof f.status === "number" ? { status: f.status } : {}),
      ...(typeof f.scanned === "number" ? { scanned: f.scanned } : {}),
      ...(typeof f.detail === "string" ? { detail: f.detail } : {}),
    });
  }
  return out;
}
