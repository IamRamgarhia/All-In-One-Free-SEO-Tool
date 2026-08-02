/**
 * The HMAC secret that signs session cookies.
 *
 * Node runtime only — it touches the filesystem. Middleware never
 * imports this; it reads `process.env.SEO_SESSION_SECRET`, which
 * `instrumentation.ts` populates at boot by calling `ensureSessionSecret()`
 * before the first request is served.
 *
 * Resolution mirrors the encryption key in crypto.ts, for the same
 * reason: a self-hosted user should not have to generate and manage a
 * secret by hand, but an operator who wants explicit control must be
 * able to take it.
 *
 *   1. SEO_SESSION_SECRET — explicit, for Docker / managed deploys
 *   2. .seo-session-secret in the data folder — auto-generated once
 *   3. APP_PASSWORD — last resort; works, but rotating the password
 *      logs everyone out, which is why it is not preferred
 *
 * Losing the secret logs everyone out and nothing else. It is not the
 * encryption key: no stored data becomes unreadable. Back it up if you
 * care about session continuity across reinstalls; otherwise don't.
 */

import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { dataDir, dataFile } from "./data-dir";

const SECRET_FILE = dataFile(".seo-session-secret");

let cached: string | null = null;

/**
 * Returns the secret, generating and persisting one on first call.
 * Safe to call repeatedly.
 */
export function ensureSessionSecret(): string {
  if (cached) return cached;

  const fromEnv = process.env.SEO_SESSION_SECRET?.trim();
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }

  try {
    if (existsSync(SECRET_FILE)) {
      const stored = readFileSync(SECRET_FILE, "utf8").trim();
      if (stored.length >= 32) {
        cached = stored;
        process.env.SEO_SESSION_SECRET = stored;
        return stored;
      }
    }

    const generated = crypto.randomBytes(32).toString("base64url");
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(path.join(dataDir(), ".seo-session-secret"), generated, {
      mode: 0o600,
    });
    try {
      chmodSync(path.join(dataDir(), ".seo-session-secret"), 0o600);
    } catch {
      // Windows may not honour chmod — not fatal.
    }
    cached = generated;
    process.env.SEO_SESSION_SECRET = generated;
    return generated;
  } catch {
    // Read-only filesystem, or a container without a writable data
    // volume. Fall back to APP_PASSWORD so accounts still work rather
    // than the whole login flow dying. Sessions won't survive a
    // password change, which is an acceptable degradation.
    const fallback = process.env.APP_PASSWORD?.trim();
    if (fallback && fallback.length > 0) {
      cached = `app-password:${fallback}`;
      process.env.SEO_SESSION_SECRET = cached;
      return cached;
    }
    // Last resort: a per-process random secret. Everyone is logged out
    // on restart, but nothing is insecure and nothing crashes.
    const ephemeral = crypto.randomBytes(32).toString("base64url");
    cached = ephemeral;
    process.env.SEO_SESSION_SECRET = ephemeral;
    console.warn(
      "[auth] could not persist a session secret; sessions will not survive a restart",
    );
    return ephemeral;
  }
}
