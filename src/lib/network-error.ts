/**
 * "Could this site not be reached?" — one table, two spellings.
 *
 * WHY THIS EXISTS: this app reaches sites two different ways, and they
 * report the same failure in words that share no substring.
 *
 *   fetch (undici):  getaddrinfo ENOTFOUND d.example.com
 *   Playwright:      page.goto: net::ERR_NAME_NOT_RESOLVED at https://…
 *
 * Both are "that domain does not exist". Two places classified them and
 * both knew only the first spelling:
 *
 *   - `checkSweepFailures` matched /fetch|reach|timeout|ENOTFOUND|
 *     ECONNREFUSED/i to decide whether to say "the site is unreachable,
 *     check the address" or the vaguer "N nightly checks failing". On
 *     the maintainer's own install, client 38's domain had stopped
 *     resolving and was the cause of 13 of 15 nightly failures — and
 *     every browser-sourced one said ERR_NAME_NOT_RESOLVED, which that
 *     regex does not match. The one diagnosis that would have fixed it
 *     in a minute was the one not shown.
 *   - `friendly-error.ts`'s DNS rule matched /ENOTFOUND|getaddrinfo|
 *     DNS/i, so the same Playwright failure fell through to "unknown
 *     error" with a link to file a GitHub issue. Inviting a bug report
 *     for a domain typo.
 *
 * Rule 4 of this project: never add a second hardcoded list of
 * something that already exists. This is the list.
 *
 * NOT INCLUDED, deliberately: 5xx responses and HTTP error statuses. A
 * site that answers 503 was reached, and "check the address you stored"
 * is the wrong advice for it.
 */

/** Why a request never got an answer. */
export type NetworkFailureKind =
  /** The hostname does not resolve. Usually a typo or a dead domain. */
  | "dns"
  /** Resolved, nothing listening. Wrong port, or the server is down. */
  | "refused"
  /** No answer in time. */
  | "timeout"
  /** Reached, but the TLS handshake was rejected. */
  | "tls"
  /** This machine has no network at all. */
  | "offline"
  /**
   * The request never completed and the reason was not recorded.
   *
   * This is undici's bare `fetch failed`, which is what
   * `(err as Error).message` gives you when the real code — ENOTFOUND,
   * ECONNREFUSED, a TLS failure — is on `err.cause`. Measured on this
   * machine against a domain that does not resolve:
   *
   *   err.message  →  "fetch failed"
   *   err.cause    →  "getaddrinfo ENOTFOUND d.dicecodes.com"
   *
   * So anything that stores only `.message` throws away the diagnosis.
   * `errorText()` below is the fix for new records; this kind keeps the
   * ones already stored useful rather than reading as "not a network
   * problem at all".
   */
  | "no_response";

/**
 * Each kind with both spellings. Node's codes and Chromium's `net::`
 * names are listed side by side on purpose — seeing the pair is what
 * stops the next person adding one and not the other.
 */
const PATTERNS: { kind: NetworkFailureKind; match: RegExp }[] = [
  {
    kind: "offline",
    // Checked before dns: Chromium reports a disconnected machine as its
    // own error, and "check your connection" beats "check the address".
    match: /net::ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ENETDOWN/i,
  },
  {
    kind: "dns",
    match:
      /ENOTFOUND|EAI_AGAIN|getaddrinfo|net::ERR_NAME_NOT_RESOLVED|net::ERR_NAME_RESOLUTION_FAILED|DNS/i,
  },
  {
    kind: "refused",
    match:
      /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|connection refused|net::ERR_CONNECTION_REFUSED|net::ERR_CONNECTION_RESET|net::ERR_CONNECTION_CLOSED|net::ERR_ADDRESS_UNREACHABLE|net::ERR_EMPTY_RESPONSE/i,
  },
  {
    kind: "tls",
    // A certificate failure is reached-but-unusable. Separate from
    // "refused" because the fix is different and often not the user's.
    //
    // Both spellings again, for the same reason as everything else here:
    // Node's `code` is SCREAMING_SNAKE while its `message` is a human
    // sentence, and whichever one a call site stored is the only one the
    // classifier will ever see. Measured: an expired cert gives
    // message "certificate has expired", code "CERT_HAS_EXPIRED".
    match:
      /CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|ERR_TLS_CERT_ALTNAME_INVALID|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|net::ERR_CERT_|certificate has expired|unable to verify the first certificate|self[- ]signed certificate|does not match certificate/i,
  },
  {
    kind: "timeout",
    // Before no_response: a timeout message often also says "fetch
    // failed", and the timeout is the more specific answer.
    match:
      /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|Connect Timeout Error|net::ERR_CONNECTION_TIMED_OUT|net::ERR_TIMED_OUT|Timeout \d+ms exceeded|timeout|timed out/i,
  },
  {
    kind: "no_response",
    // Last, and deliberately vague, because the message is.
    //
    // The second half is THIS APP'S OWN prose. Measured by running the
    // real nightly sweep against a copy on 19 Nov 2026: of nine checks
    // failing on one client whose domain had stopped resolving, not one
    // stored error contained a network code. Every tool had caught the
    // error and written its own sentence instead:
    //
    //   Hop 1 failed: fetch failed
    //   Couldn't fetch https://d.dicecodes.com (0)
    //   Couldn't reach https://d.dicecodes.com.
    //   Couldn't reach the site.
    //   Couldn't fetch llms.txt: fetch failed
    //
    // So the diagnosis is destroyed at the source, and no classifier
    // downstream can recover it. These phrases are matched as the
    // weakest possible signal — enough to say "the site could not be
    // reached", not enough to say why.
    //
    // Anchored on a URL or "the site" on purpose: matching the bare
    // word "fetch" would also catch "could not fetch the model list",
    // which is an AI-provider problem and wants different advice.
    match:
      /fetch failed|Failed to fetch|network error|socket hang up|EPIPE|(?:could ?n[o']?t|unable to|failed to) (?:reach|fetch|load|connect to) (?:https?:\/\/|the site|the page|the url)/i,
  },
];

/**
 * The patterns by kind, for a caller that needs the regex itself rather
 * than a classification.
 *
 * `friendly-error.ts` is the one: it pattern-matches in a fixed order
 * where first match wins, and its ordering is its own business (an AI
 * provider outage and an unreachable client site want different
 * advice). What it must NOT keep is its own copy of the patterns — its
 * DNS rule was `/ENOTFOUND|getaddrinfo|DNS/i` and so missed every
 * browser-sourced DNS failure in the app.
 */
export const NETWORK_PATTERN: Record<NetworkFailureKind, RegExp> =
  Object.fromEntries(PATTERNS.map((p) => [p.kind, p.match])) as Record<
    NetworkFailureKind,
    RegExp
  >;

/**
 * Which kind of unreachable, or null when the message is not about
 * reaching a server at all.
 *
 * Null is the important half: a model refusal, a parse error or an HTTP
 * 500 must NOT be read as "the site is down", because that sends
 * someone to re-check a domain that is fine.
 */
export function classifyNetworkError(raw: unknown): NetworkFailureKind | null {
  const text = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : String(raw ?? "");
  if (!text) return null;
  for (const p of PATTERNS) if (p.match.test(text)) return p.kind;
  return null;
}

/** True when the message means a server could not be reached at all. */
export function isUnreachable(raw: unknown): boolean {
  return classifyNetworkError(raw) !== null;
}

/**
 * One plain-language line per kind, for a status surface.
 *
 * Deliberately about the SITE rather than about this app: these are
 * shown next to a client whose checks failed, and the useful question
 * is "is the address right", not "what did undici return".
 */
export function describeNetworkFailure(kind: NetworkFailureKind): string {
  switch (kind) {
    case "dns":
      return "the address does not resolve — the domain may be misspelled, expired, or a staging site that no longer exists";
    case "refused":
      return "the address resolves but nothing answered — the site may be down, or behind a firewall that blocks this machine";
    case "timeout":
      return "the site accepted the connection but never finished answering";
    case "tls":
      return "the site answered but its HTTPS certificate was rejected";
    case "offline":
      return "this machine appears to have no internet connection, so nothing could be checked";
    case "no_response":
      return "the request to the site never completed, and the underlying reason was not recorded";
  }
}

/**
 * One diagnosis for a batch of failures on the same target.
 *
 * `no_response` is the only kind that means "I do not know why", so it
 * must never win a vote it is merely more numerous in. Measured on this
 * install: of nine nightly checks failing on one client, EIGHT stored a
 * message with the cause stripped out and ONE had kept it —
 * "ENOTFOUND getaddrinfo ENOTFOUND d.dicecodes.com". Picking the
 * commonest kind reported "the reason was not recorded" while holding
 * the reason, which is the worst of both: it had the answer and showed
 * the shrug.
 *
 * Returns null when nothing in the batch was a network failure at all.
 */
export function leadingFailureKind(
  errors: readonly unknown[],
): NetworkFailureKind | null {
  const counts = new Map<NetworkFailureKind, number>();
  for (const e of errors) {
    const k = classifyNetworkError(e);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  const known = [...counts.entries()].filter(([k]) => k !== "no_response");
  const pool = known.length > 0 ? known : [...counts.entries()];
  return pool.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * An error's message WITH its cause, for anything that stores one.
 *
 * `(err as Error).message` on a failed `fetch` is the string
 * "fetch failed" and nothing else — the code that says what actually
 * happened lives on `err.cause`. Measured here against a dead domain:
 * the message was "fetch failed" while the cause held "getaddrinfo
 * ENOTFOUND d.dicecodes.com".
 *
 * Every nightly sweep failure on this install was stored through
 * `.message`, which is why 13 of 15 of them read as "fetch failed" with
 * no hint that one client's domain had stopped resolving.
 *
 * Bounded, because this text is stored and displayed.
 */
export function errorText(err: unknown, max = 200): string {
  if (err === null || err === undefined) return "";
  if (typeof err === "string") return err.slice(0, max);

  const e = err as { message?: unknown; cause?: unknown; code?: unknown };
  const parts: string[] = [];
  if (typeof e.message === "string" && e.message) parts.push(e.message);
  else parts.push(String(err));

  // The cause's own code and message, when they add anything. `cause`
  // is often an Error; occasionally a string or a plain object.
  const c = e.cause as { code?: unknown; message?: unknown } | string | undefined;
  if (typeof c === "string" && c) {
    if (!parts[0].includes(c)) parts.push(c);
  } else if (c && typeof c === "object") {
    const code = typeof c.code === "string" ? c.code : "";
    const msg = typeof c.message === "string" ? c.message : "";
    const extra = [code, msg].filter((s) => s && !parts[0].includes(s)).join(" ");
    if (extra) parts.push(extra);
  } else if (typeof e.code === "string" && e.code && !parts[0].includes(e.code)) {
    parts.push(e.code);
  }

  return parts.join(": ").replace(/\s+/g, " ").slice(0, max);
}
