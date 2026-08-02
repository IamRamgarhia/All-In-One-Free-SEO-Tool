import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_MS,
  signSession,
  userFingerprint,
  verifySession,
} from "./session-token";

/**
 * The session token is the whole auth gate for a multi-user install: the
 * Edge middleware has no database, so a token it accepts is a request it
 * lets through. Every test here is a "would this forgery get in?"
 * question, because the failure mode is silent — a forged token that
 * verifies produces no error anywhere, just access.
 */

const SECRET = "test-secret-not-used-anywhere-real";
const OTHER_SECRET = "a-different-secret-of-the-same-shape";

function claims(overrides: Partial<Parameters<typeof signSession>[0]> = {}) {
  return {
    userId: 7,
    expiresAt: Date.now() + SESSION_TTL_MS,
    fingerprint: "abcdef0123456789",
    ...overrides,
  };
}

describe("verifySession", () => {
  it("accepts a token it just signed", async () => {
    const c = claims();
    const verified = await verifySession(await signSession(c, SECRET), SECRET);
    expect(verified).toEqual(c);
  });

  it("rejects a token signed with a different secret", async () => {
    // i.e. someone who read the cookie format out of this file but
    // doesn't have the server's secret.
    const token = await signSession(claims(), OTHER_SECRET);
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it("rejects an edited user id", async () => {
    // The single most valuable forgery: become user 1 (the owner).
    const token = await signSession(claims({ userId: 7 }), SECRET);
    const parts = token.split(".");
    parts[1] = "1";
    expect(await verifySession(parts.join("."), SECRET)).toBeNull();
  });

  it("rejects an extended expiry", async () => {
    const token = await signSession(
      claims({ expiresAt: Date.now() - 1000 }),
      SECRET,
    );
    const parts = token.split(".");
    parts[2] = String(Date.now() + 10 * SESSION_TTL_MS);
    expect(await verifySession(parts.join("."), SECRET)).toBeNull();
  });

  it("rejects an expired token even though the signature is good", async () => {
    const token = await signSession(
      claims({ expiresAt: Date.now() - 1 }),
      SECRET,
    );
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it("rejects an edited fingerprint", async () => {
    // The fingerprint is what makes "deactivate this person" and
    // "change your password" revoke live sessions. If it were editable,
    // both would be advisory.
    const token = await signSession(claims(), SECRET);
    const parts = token.split(".");
    parts[3] = "0000000000000000";
    expect(await verifySession(parts.join("."), SECRET)).toBeNull();
  });

  it("rejects junk, empty and missing tokens", async () => {
    for (const bad of [undefined, null, "", "nope", "v1.1.2.3", "a.b.c.d.e"]) {
      expect(await verifySession(bad, SECRET), String(bad)).toBeNull();
    }
  });

  it("rejects a token from a future format version", async () => {
    const token = await signSession(claims(), SECRET);
    expect(
      await verifySession(token.replace(/^v1\./, "v2."), SECRET),
    ).toBeNull();
  });

  it("rejects a negative or zero user id", async () => {
    for (const id of [0, -1]) {
      const token = await signSession(claims({ userId: id }), SECRET);
      expect(await verifySession(token, SECRET), String(id)).toBeNull();
    }
  });
});

describe("userFingerprint", () => {
  it("changes when the password changes", async () => {
    const before = await userFingerprint("scrypt:1:aa:bb", true);
    const after = await userFingerprint("scrypt:1:aa:cc", true);
    expect(after).not.toBe(before);
  });

  it("changes when the account is deactivated", async () => {
    // This is what makes deactivation take effect immediately rather
    // than in up to 14 days, when the token would have expired anyway.
    const active = await userFingerprint("scrypt:1:aa:bb", true);
    const inactive = await userFingerprint("scrypt:1:aa:bb", false);
    expect(inactive).not.toBe(active);
  });

  it("is stable for unchanged input", async () => {
    expect(await userFingerprint("scrypt:1:aa:bb", true)).toBe(
      await userFingerprint("scrypt:1:aa:bb", true),
    );
  });

  it("does not leak the password hash", async () => {
    const hash = "scrypt:1:deadbeef:cafebabe";
    const fp = await userFingerprint(hash, true);
    expect(fp).not.toContain("deadbeef");
    expect(fp).not.toContain("cafebabe");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});
