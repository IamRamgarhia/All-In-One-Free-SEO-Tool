/**
 * Tiny in-memory rate limiter. One sliding window per key. Self-hosted
 * single-process app — no Redis, no distributed concerns.
 *
 * Usage:
 *   const allowed = checkRateLimit(`test:${ip}`, { max: 10, windowMs: 60_000 });
 *   if (!allowed) return new Response("rate limited", { status: 429 });
 *
 * Cleanup: stale buckets are pruned lazily on each check, so memory
 * usage stays bounded even when many distinct keys appear.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitOpts = {
  /** Max requests permitted in the window */
  max: number;
  /** Window length in ms */
  windowMs: number;
};

export function checkRateLimit(key: string, opts: RateLimitOpts): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const bucket: Bucket = { count: 1, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
    // Opportunistic cleanup — drop expired buckets so the map stays bounded
    if (buckets.size > 1000) {
      for (const [k, b] of buckets) {
        if (now >= b.resetAt) buckets.delete(k);
      }
    }
    return { allowed: true, remaining: opts.max - 1, resetAt: bucket.resetAt };
  }

  if (existing.count >= opts.max) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: opts.max - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Extract a stable client key from a request — IP from X-Forwarded-For
 * or the request URL's hostname. For self-hosted local apps, this is
 * usually "127.0.0.1"; remote callers get their real IP.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  try {
    return new URL(req.url).hostname;
  } catch {
    return "unknown";
  }
}
