/**
 * Constant-time string comparison. Used for password cookie + login
 * route validation. Pure-JS so it works in both Edge runtime (middleware)
 * and Node runtime (API routes) — Node's crypto.timingSafeEqual isn't
 * available in Edge.
 *
 * Mitigates timing attacks against the auth gate. For a self-hosted
 * single-user app on HTTPS this is closer to defense-in-depth than
 * critical — but the cost is one tiny function so we use it everywhere.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
