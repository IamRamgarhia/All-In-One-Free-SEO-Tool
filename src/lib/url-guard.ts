/**
 * SSRF guard for every server-side fetch of a user-supplied URL.
 *
 * This tool's whole job is fetching URLs someone typed in — audits,
 * the grader, header checks, sitemap fetches, competitor scans. Each of
 * those runs on the server, so "fetch this URL" is really "make my
 * server open a connection to wherever this string points", including
 * places the user can't reach themselves:
 *
 *   http://169.254.169.254/latest/meta-data/   AWS instance credentials
 *   http://metadata.google.internal/           GCP metadata
 *   http://127.0.0.1:6379/                     Redis on the same box
 *   http://192.168.1.1/                        the router's admin page
 *
 * A version of this existed in wp-bridge.ts and nowhere else, so the
 * WordPress endpoint was protected and the crawler wasn't. It also only
 * inspected the hostname string, which misses the more interesting
 * attack: point a domain you control at 127.0.0.1 and the literal
 * checks all pass.
 *
 * This module adds DNS resolution, so the decision is made on the IP
 * actually being connected to, and re-checks after redirects — a public
 * URL that 302s to the metadata endpoint is the standard bypass.
 *
 * Deliberately allowed: nothing. There is no opt-out flag here. Callers
 * that legitimately need to reach a private address (the health ping,
 * the launcher) talk to a known fixed URL and don't go through this.
 */

import { lookup } from "node:dns/promises";

export type UrlGuardResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/**
 * Private / reserved IPv4 and IPv6 ranges.
 *
 * Split out and tested directly because a mistake here is invisible:
 * too loose and the guard does nothing, too strict and legitimate
 * audits of a customer site start failing with a confusing error.
 */
export function isPrivateIp(ip: string): boolean {
  const addr = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");

  // IPv4-mapped IPv6 (::ffff:127.0.0.1) — unwrap and treat as IPv4.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : addr;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const p = v4.split(".").map(Number);
    if (p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local — cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 + test nets
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }

  // IPv6
  if (addr === "::" || addr === "::1") return true; // unspecified / loopback
  if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
  if (/^f[cd]/.test(addr)) return true; // unique-local fc00::/7
  if (/^ff/.test(addr)) return true; // multicast

  return false;
}

/** Hostnames that mean "this machine" or a cloud metadata service. */
function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "ip6-localhost" ||
    h === "ip6-loopback" ||
    // Cloud metadata by name — these resolve to link-local, but blocking
    // the name too gives a clearer error and covers split-horizon DNS.
    h === "metadata.google.internal" ||
    h === "metadata.goog" ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  );
}

/**
 * Validate a URL before fetching it.
 *
 * `resolveDns` is on by default and is what makes this more than string
 * matching. Turn it off only where a DNS round-trip per URL is too
 * expensive AND the literal checks are enough (they usually aren't).
 */
export async function guardUrl(
  raw: string,
  opts: { resolveDns?: boolean } = {},
): Promise<UrlGuardResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      reason: `Only http and https URLs can be fetched (got "${url.protocol}").`,
    };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (isBlockedHostname(host)) {
    return {
      ok: false,
      reason: `"${url.hostname}" points at this machine or a cloud metadata service, so it can't be fetched.`,
    };
  }

  // An IP literal needs no DNS — check it directly.
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host)) {
      return {
        ok: false,
        reason: `${url.hostname} is a private or reserved address, so it can't be fetched from the server.`,
      };
    }
    return { ok: true, url };
  }

  if (opts.resolveDns === false) return { ok: true, url };

  // Resolve and check every address the name maps to. A hostname with
  // both a public and a private A record would otherwise be a coin flip.
  try {
    const addrs = await lookup(host, { all: true });
    for (const a of addrs) {
      if (isPrivateIp(a.address)) {
        return {
          ok: false,
          reason: `${url.hostname} resolves to a private address (${a.address}), so it can't be fetched from the server.`,
        };
      }
    }
  } catch {
    // NXDOMAIN or DNS failure. Let the fetch proceed and fail on its own
    // — returning "blocked" here would report a typo'd domain as a
    // security problem, which sends users down the wrong path.
    return { ok: true, url };
  }

  return { ok: true, url };
}

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SsrfBlockedError";
  }
}

/**
 * `fetch` with the guard applied to the initial URL and to every
 * redirect hop.
 *
 * Redirects are handled manually (`redirect: "manual"`) because that is
 * the bypass this class of bug always comes back through: the URL the
 * user gave is fine, and it 302s to the metadata endpoint. Following
 * redirects automatically means only the first hop is ever checked.
 */
export async function guardedFetch(
  input: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  const maxRedirects = init.maxRedirects ?? 5;
  let current = input;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const verdict = await guardUrl(current);
    if (!verdict.ok) throw new SsrfBlockedError(verdict.reason);

    const res = await fetch(current, { ...init, redirect: "manual" });

    // 3xx with a Location — validate the target before following.
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }

  throw new SsrfBlockedError(
    `Too many redirects (more than ${maxRedirects}) — stopped following.`,
  );
}
