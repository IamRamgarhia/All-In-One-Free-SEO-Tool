/**
 * Session tokens that the Edge runtime can verify.
 *
 * The constraint driving this file: middleware runs in Next's Edge
 * sandbox, where better-sqlite3 does not exist. So middleware cannot
 * look a session up in the database — it can only check a signature.
 *
 * Hence a stateless token: the user id and expiry travel inside the
 * cookie, HMAC-signed so they can't be edited. Middleware verifies the
 * signature and decides redirect-or-pass; the Node side then loads the
 * actual user row and applies roles. Two layers, each doing the part it
 * can do:
 *
 *   middleware  — is this cookie authentic and unexpired?  (cheap, edge)
 *   requireUser — who is it, what may they see?            (DB, node)
 *
 * The tradeoff of stateless sessions is that you cannot revoke an
 * individual token before it expires. We accept that and mitigate it:
 * the token embeds a `pw` fingerprint of the user's password hash and
 * their active flag, so deactivating someone or changing their password
 * invalidates every session they have — which are the two revocations
 * that actually matter for an agency. Sessions are 14 days, not 30, for
 * the same reason.
 *
 * Everything here uses WebCrypto only. No node:crypto, no imports that
 * would pull the Node runtime into the edge bundle.
 */

const VERSION = "v1";
/** 14 days. Short enough that a stolen laptop stops mattering fairly soon. */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "stb_session";

export type SessionClaims = {
  userId: number;
  /** Epoch ms. */
  expiresAt: number;
  /** Fingerprint of password hash + active flag — see file header. */
  fingerprint: string;
};

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return b64url(new Uint8Array(sig));
}

/**
 * A short, stable fingerprint of the parts of a user row that must
 * invalidate live sessions when they change. Truncated to 16 hex chars:
 * this is a change-detector, not a secret, and the whole token is signed
 * anyway.
 */
export async function userFingerprint(
  passwordHash: string,
  active: boolean,
): Promise<string> {
  const data = new TextEncoder().encode(`${passwordHash}|${active ? 1 : 0}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signSession(
  claims: SessionClaims,
  secret: string,
): Promise<string> {
  const payload = `${VERSION}.${claims.userId}.${claims.expiresAt}.${claims.fingerprint}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

/**
 * Returns the claims if the token is authentic and unexpired, else null.
 *
 * Note what this deliberately does NOT check: whether the user still
 * exists, is still active, or still has the role the caller expects.
 * None of that is knowable at the edge. Callers that need it must go
 * through `requireUser()` on the Node side.
 */
export async function verifySession(
  token: string | undefined | null,
  secret: string,
  now = Date.now(),
): Promise<SessionClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [version, rawId, rawExp, fingerprint, sig] = parts;
  if (version !== VERSION) return null;

  const payload = `${version}.${rawId}.${rawExp}.${fingerprint}`;
  const expected = await hmac(secret, payload);
  // Constant-time-ish: same-length compare with no early exit. Both
  // values are fixed-length base64url of a SHA-256, so a length
  // mismatch already means forged.
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  const userId = Number(rawId);
  const expiresAt = Number(rawExp);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  return { userId, expiresAt, fingerprint };
}
