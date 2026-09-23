/**
 * The token an edge worker authenticates with.
 *
 * One token per install rather than per client. The worker is configured
 * with a client id as well, and both have to line up — but the token is
 * the secret, and rotating it is one action rather than N.
 *
 * Compared in constant time. This endpoint is reachable from the public
 * internet by construction (Cloudflare has to call it), so an early-exit
 * string compare leaks the token a character at a time to anyone patient
 * enough to measure. That is a real attack on a real secret, not a
 * theoretical one, and the fix is four lines.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting, deleteSetting } from "./settings-store";

const KEY = "edge.token";

/** 32 bytes of base64url — long enough that guessing is not a strategy. */
export function generateEdgeToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function getEdgeToken(): Promise<string | null> {
  return (await getSetting<string>(KEY).catch(() => null)) ?? null;
}

export async function rotateEdgeToken(): Promise<string> {
  const token = generateEdgeToken();
  await setSetting(KEY, token);
  return token;
}

export async function clearEdgeToken(): Promise<void> {
  await deleteSetting(KEY).catch(() => undefined);
}

/**
 * Does this token match the stored one?
 *
 * False when nothing is configured. The alternative — treating "no
 * token set up" as "allow anything" — is the shape of authentication
 * bug that ships most often, because the happy path works perfectly in
 * testing and the hole only exists on installs nobody configured.
 */
export async function edgeTokenMatches(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  const stored = await getEdgeToken();
  if (!stored) return false;
  return constantTimeEqual(candidate, stored);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // timing signal. Both are hashed to a fixed width first so the compare
  // is always over equal lengths.
  if (ab.length !== bb.length) {
    // Still do a compare of equal-length buffers so the work done does
    // not depend on whether the lengths matched.
    const pad = Buffer.alloc(Math.max(ab.length, bb.length));
    const other = Buffer.alloc(pad.length);
    ab.copy(pad);
    bb.copy(other);
    timingSafeEqual(pad, other);
    return false;
  }
  return timingSafeEqual(ab, bb);
}
