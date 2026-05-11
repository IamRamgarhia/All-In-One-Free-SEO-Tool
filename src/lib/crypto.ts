/**
 * Encryption-at-rest for sensitive fields stored in data.db (AI provider
 * API keys, Google OAuth tokens, WordPress bridge credentials).
 *
 * Threat model: an attacker gets a copy of data.db (backup leaked,
 * machine stolen, file accidentally shared). Without the encryption key,
 * the credentials are useless ciphertext. The key lives in a sibling
 * file or env var that the user controls separately.
 *
 * Algorithm: AES-256-GCM. 96-bit random nonce per encryption. 128-bit
 * auth tag. Both bundled into the stored value alongside the ciphertext.
 *
 * Format: `enc:v1:<base64-nonce>:<base64-ciphertext-with-tag>`
 * The prefix lets us:
 *   - Skip decryption for already-plain values (during migration)
 *   - Skip re-encryption for already-encrypted values
 *   - Switch algorithms later by bumping the version tag
 *
 * Key resolution priority:
 *   1. process.env.SEO_ENCRYPTION_KEY (base64-encoded 32 bytes) — for
 *      Docker / managed deploys where users want explicit control
 *   2. .seo-encryption-key file in the repo root — auto-generated on
 *      first encrypt() call. Gitignored. User backs this up alongside
 *      data.db OR loses access to their stored credentials.
 *
 * If neither exists and we have no permission to write, we fall back to
 * a plaintext passthrough so the app never crashes — but log a warning.
 */

import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";

const PREFIX = "enc:v1:";
const KEY_FILE = path.join(process.cwd(), ".seo-encryption-key");

let cachedKey: Buffer | null = null;
let warnedMissing = false;

function loadOrCreateKey(): Buffer | null {
  if (cachedKey) return cachedKey;

  // 1. Env var
  const envKey = process.env.SEO_ENCRYPTION_KEY;
  if (envKey) {
    try {
      const buf = Buffer.from(envKey, "base64");
      if (buf.length === 32) {
        cachedKey = buf;
        return cachedKey;
      }
    } catch {
      // fall through
    }
  }

  // 2. Key file
  try {
    if (existsSync(KEY_FILE)) {
      const buf = Buffer.from(readFileSync(KEY_FILE, "utf-8").trim(), "base64");
      if (buf.length === 32) {
        cachedKey = buf;
        return cachedKey;
      }
    }
  } catch {
    // fall through to generation
  }

  // 3. Generate + persist
  try {
    const fresh = crypto.randomBytes(32);
    writeFileSync(KEY_FILE, fresh.toString("base64"), { mode: 0o600 });
    try {
      chmodSync(KEY_FILE, 0o600);
    } catch {
      // Windows may not honor chmod — ignore
    }
    cachedKey = fresh;
    return cachedKey;
  } catch (err) {
    if (!warnedMissing) {
      console.warn(
        "[crypto] Could not create .seo-encryption-key — credentials will be stored unencrypted. Reason:",
        (err as Error).message,
      );
      warnedMissing = true;
    }
    return null;
  }
}

/** Returns true if the input looks like one of our encrypted blobs. */
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt a plaintext string. Returns the encoded ciphertext. If no key
 * can be obtained, returns the plaintext as-is so the app never breaks
 * — the caller is no worse off than before encryption was introduced.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  if (isEncrypted(plaintext)) return plaintext; // already encrypted
  const key = loadOrCreateKey();
  if (!key) return plaintext;

  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Append auth tag to ciphertext so decrypt() can split them out
  const ctWithTag = Buffer.concat([ct, tag]);
  return `${PREFIX}${nonce.toString("base64")}:${ctWithTag.toString("base64")}`;
}

/**
 * Decrypt a stored value. Plain values (no enc: prefix) are passed
 * through unchanged — supports lazy migration of legacy plaintext rows.
 * Returns the plaintext, or the original input if decryption fails
 * (e.g. wrong key, corrupted ciphertext).
 */
export function decrypt(value: string): string {
  if (!value || !isEncrypted(value)) return value;
  const key = loadOrCreateKey();
  if (!key) return value;

  try {
    const body = value.slice(PREFIX.length);
    const [nonceB64, ctWithTagB64] = body.split(":");
    if (!nonceB64 || !ctWithTagB64) return value;
    const nonce = Buffer.from(nonceB64, "base64");
    const ctWithTag = Buffer.from(ctWithTagB64, "base64");
    // The last 16 bytes are the GCM auth tag
    const tag = ctWithTag.subarray(ctWithTag.length - 16);
    const ct = ctWithTag.subarray(0, ctWithTag.length - 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf-8");
  } catch (err) {
    console.warn(
      "[crypto] decrypt failed — returning ciphertext as-is. Reason:",
      (err as Error).message,
    );
    return value;
  }
}

/** Convenience: re-encrypt only if currently plaintext. Used by lazy migration. */
export function ensureEncrypted(value: string): string {
  if (!value) return value;
  return isEncrypted(value) ? value : encrypt(value);
}
