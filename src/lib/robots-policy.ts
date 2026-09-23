/**
 * robots.txt parsing and enforcement for our own crawler.
 *
 * The audit crawler fetched robots.txt only to *grade* it, never to
 * obey it — no Disallow handling, no Crawl-delay. For a tool that
 * crawls third-party sites (competitor analysis, prospect audits) that
 * is both a bad look and a real liability, and it's the one rule an SEO
 * tool of all things should not get wrong.
 *
 * Implements the subset of RFC 9309 that matters in practice:
 *   - User-agent group matching, most-specific wins, `*` fallback
 *   - Allow / Disallow with longest-match-wins precedence
 *   - `$` end anchor and `*` wildcards in paths
 *   - Crawl-delay (seconds)
 *
 * Deliberately NOT supported: Sitemap (handled elsewhere), Host,
 * Request-rate, Visit-time — none affect whether we may fetch a URL.
 */

import { guardedFetch } from "./url-guard";

export type RobotsRule = { allow: boolean; pattern: string };

export type RobotsPolicy = {
  /** Rules for the best-matching user-agent group, in file order. */
  rules: RobotsRule[];
  /** Seconds to wait between requests, if the site asked for one. */
  crawlDelaySec: number | null;
  /**
   * True when we could not read robots.txt at all (network error).
   * Per RFC 9309 a 4xx means "allow everything" but a persistent 5xx or
   * timeout means "assume disallowed" — callers decide how strict to be.
   */
  unreachable: boolean;
};

export const ALLOW_ALL: RobotsPolicy = {
  rules: [],
  crawlDelaySec: null,
  unreachable: false,
};

/**
 * Parse robots.txt for a specific user-agent token.
 *
 * Group selection follows RFC 9309: collect every group whose
 * User-agent lines match us, preferring the most specific (longest)
 * match, and fall back to `*`. Records outside any group are ignored.
 */
export function parseRobots(text: string, userAgent: string): RobotsPolicy {
  const ua = userAgent.toLowerCase();
  // agentToken -> accumulated rules. A group can list several agents.
  const groups = new Map<string, { rules: RobotsRule[]; delay: number | null }>();

  let currentAgents: string[] = [];
  // robots.txt groups end at the first non-User-agent line following
  // one or more User-agent lines; consecutive User-agent lines share
  // the same rule block.
  let expectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!expectingAgents) {
        currentAgents = [];
        expectingAgents = true;
      }
      currentAgents.push(value.toLowerCase());
      if (!groups.has(value.toLowerCase())) {
        groups.set(value.toLowerCase(), { rules: [], delay: null });
      }
      continue;
    }

    if (currentAgents.length === 0) continue;
    expectingAgents = false;

    if (field === "allow" || field === "disallow") {
      // An empty Disallow means "allow everything" — record it as an
      // allow rule so longest-match still behaves.
      for (const agent of currentAgents) {
        groups.get(agent)!.rules.push({
          allow: field === "allow" || value === "",
          pattern: value,
        });
      }
    } else if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) {
        for (const agent of currentAgents) {
          groups.get(agent)!.delay = n;
        }
      }
    }
  }

  // Most specific matching agent wins; `*` is the fallback.
  let best: { rules: RobotsRule[]; delay: number | null } | null = null;
  let bestLen = -1;
  for (const [agent, group] of groups) {
    if (agent === "*") {
      if (bestLen < 0) {
        best = group;
        bestLen = 0;
      }
      continue;
    }
    if (ua.includes(agent) && agent.length > bestLen) {
      best = group;
      bestLen = agent.length;
    }
  }

  return {
    rules: best?.rules ?? [],
    crawlDelaySec: best?.delay ?? null,
    unreachable: false,
  };
}

/** Convert a robots.txt path pattern (with * and $) to a RegExp. */
function patternToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      out += ".*";
    } else if (ch === "$" && i === pattern.length - 1) {
      out += "$";
    } else {
      out += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp("^" + out);
}

/**
 * Is `pathname` (plus query) crawlable under this policy?
 *
 * Longest matching pattern wins; Allow beats Disallow on an exact
 * length tie, which is the behaviour Google documents.
 */
export function isAllowed(policy: RobotsPolicy, pathAndQuery: string): boolean {
  let bestLen = -1;
  let bestAllow = true;

  for (const rule of policy.rules) {
    if (rule.pattern === "") continue;
    let re: RegExp;
    try {
      re = patternToRegExp(rule.pattern);
    } catch {
      continue;
    }
    if (!re.test(pathAndQuery)) continue;
    const len = rule.pattern.length;
    if (len > bestLen || (len === bestLen && rule.allow)) {
      bestLen = len;
      bestAllow = rule.allow;
    }
  }

  return bestLen === -1 ? true : bestAllow;
}

/**
 * Fetch and parse robots.txt for an origin.
 *
 * A 4xx (including 404) means no restrictions — that is the RFC's
 * "allow all" case and by far the most common. A 5xx or a network
 * failure is reported via `unreachable` so the caller can decide; we
 * don't hard-block on it, because a flaky origin shouldn't make the
 * tool refuse to audit a site the user owns.
 */
export async function fetchRobotsPolicy(
  origin: string,
  userAgent: string,
  timeoutMs = 6_000,
  /**
   * See runAudit's allowPrivateHosts.
   *
   * Missing here, and the consequence was the worst of the three places
   * it was missing. The guard rejected the fetch, the catch below turned
   * that into ALLOW_ALL, and the crawler then ignored robots.txt
   * completely on exactly the private hosts that option exists for —
   * walking paths the owner had disallowed and ignoring a Crawl-delay
   * they had asked for. Silently, and while reporting the site as
   * having a valid robots.txt, because a different code path fetched
   * that one correctly.
   */
  allowPrivate = false,
): Promise<RobotsPolicy> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await guardedFetch(`${origin}/robots.txt`, {
      signal: ctl.signal,
      headers: { "user-agent": userAgent, accept: "text/plain" },
      allowPrivate,
    });
    if (res.status >= 400 && res.status < 500) return ALLOW_ALL;
    if (!res.ok) return { ...ALLOW_ALL, unreachable: true };
    const text = await res.text();
    // A robots.txt that is actually an HTML error page tells us nothing.
    if (/^\s*<(?:!doctype|html)/i.test(text)) return ALLOW_ALL;
    return parseRobots(text, userAgent);
  } catch {
    return { ...ALLOW_ALL, unreachable: true };
  } finally {
    clearTimeout(t);
  }
}
