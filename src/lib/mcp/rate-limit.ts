/**
 * A per-token request cap for the remote MCP endpoint.
 *
 * The endpoint is reachable by anyone who can reach the host, and a
 * token that leaks is the only thing between them and every client's
 * data. The autonomy levels already bound what a *run* may change; they
 * bound nothing about how many times a caller may ask. A loop calling
 * `check_indexing` burns the property's 2,000 daily Search Console
 * inspections in a couple of minutes, and one calling `run_agent`
 * hammers the crawler.
 *
 * Fixed window rather than a token bucket: it is the version whose
 * behaviour a person can predict from the error message ("try again in
 * 34 seconds"), and the difference only matters at the boundary.
 *
 * In memory, so it resets when the process does. That is the right
 * trade for a self-hosted single-process app — a restart-proof counter
 * would mean a write to SQLite on every request to stop an abuser who
 * already has a valid token.
 */

export type RateVerdict =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export type RateLimitOptions = {
  /** Requests allowed per window. */
  requests: number;
  windowMs: number;
  /** Injectable for tests. */
  now?: number;
};

/** What the remote endpoint uses. Two requests a second, sustained. */
export const MCP_RATE_LIMIT: Pick<RateLimitOptions, "requests" | "windowMs"> = {
  requests: 120,
  windowMs: 60_000,
};

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

/**
 * Stops the map growing without bound when many tokens are seen.
 * Only runs when it has grown past a size no real install reaches.
 */
function prune(now: number, windowMs: number): void {
  if (buckets.size <= 1_000) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) buckets.delete(key);
  }
}

export function rateLimit(key: string, opts: RateLimitOptions): RateVerdict {
  const now = opts.now ?? Date.now();
  prune(now, opts.windowMs);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= opts.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: opts.requests - 1 };
  }

  if (bucket.count >= opts.requests) {
    const msLeft = bucket.windowStart + opts.windowMs - now;
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)) };
  }

  bucket.count += 1;
  return { ok: true, remaining: opts.requests - bucket.count };
}

/** Tests only. */
export function resetRateLimits(): void {
  buckets.clear();
}
