/**
 * Connecting Google without the OAuth dance.
 *
 * The OAuth flow this app has always used works, and it asks a lot: make
 * a Cloud project, configure a consent screen, publish the app, create a
 * web client, register a redirect URI that must match to the character,
 * sign in through a browser, and click past an "unverified app" warning
 * about your own software. Two of those steps fail quietly rather than
 * loudly. An unpublished app gets a refresh token that expires after
 * seven days, so the connection works and then stops a week later. A
 * redirect URI that differs by a trailing slash fails with a 400 that
 * names nothing useful.
 *
 * A service account skips all of it. You create one, download its key,
 * paste it here, and then add its email address as a user on the
 * Search Console property and the Analytics property — the same three
 * clicks as inviting a colleague. There is no consent screen, no
 * redirect, no browser, and no expiry to be surprised by.
 *
 * The no-browser part matters more than it sounds for a self-hosted
 * tool. OAuth needs a redirect back to a URL you can open, which is
 * awkward on a VPS with no desktop. This needs nothing but outbound
 * HTTPS.
 *
 * What it deliberately does NOT cover: Google Business Profile and
 * Gmail. Those need a real end user behind them, or Workspace
 * domain-wide delegation, which is a much bigger ask than this replaces.
 * Anyone who needs those still connects over OAuth, and both methods can
 * be configured at once.
 */

import { createSign } from "node:crypto";
import { decrypt, encrypt } from "./crypto";
import { getSetting, setSetting, deleteSetting } from "./settings-store";

/**
 * What the JSON key file has to contain for this to work.
 *
 * Google's file carries a dozen fields; these are the three that are
 * used. Validating them on paste rather than on first use is the point:
 * the alternative is a settings screen that accepts anything and a
 * failure three days later inside a scheduled job.
 */
export type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  /** Present in every real key file. Used only to tell the user which project. */
  project_id?: string;
  type?: string;
};

const KEY_SETTING = "google.service_account_json";
const TOKEN_SETTING = "google.service_account_token";
const TOKEN_EXPIRY_SETTING = "google.service_account_token_expires_at";

/**
 * The scopes a service account is actually asked for.
 *
 * Narrower than the OAuth set on purpose. A plain service account cannot
 * hold the Business Profile or Gmail scopes, and asking for them gets a
 * token that looks fine and then produces a 403 on use — a failure that
 * would read as "this feature is broken" rather than "this login cannot
 * do that".
 */
export const SERVICE_ACCOUNT_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

/** Base64url, which is base64 with three substitutions and no padding. */
function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Read a pasted key file, or say precisely what is wrong with it.
 *
 * Returns a message rather than throwing because every caller wants to
 * show it to somebody. "Invalid JSON" on its own has sent people back to
 * Google Cloud to regenerate a key that was never the problem.
 */
export function parseServiceAccountKey(
  raw: string,
): { ok: true; key: ServiceAccountKey } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Paste the JSON key file's contents." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error:
        "That is not valid JSON. Open the .json file Google downloaded and paste all of it, including the outer braces.",
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Expected a JSON object, got something else." };
  }
  const k = parsed as Record<string, unknown>;

  // The most common wrong paste: the OAuth client secret file, which is
  // a different download from the same console page and looks similar
  // enough that the mistake is easy and the error otherwise baffling.
  if ("installed" in k || "web" in k) {
    return {
      ok: false,
      error:
        "That is an OAuth client secret file, not a service account key. In Google Cloud go to Service Accounts, pick yours, then Keys, then Add key.",
    };
  }

  if (typeof k.client_email !== "string" || !k.client_email.includes("@")) {
    return {
      ok: false,
      error: "No client_email in that file, so it is not a service account key.",
    };
  }
  if (typeof k.private_key !== "string" || !k.private_key.includes("PRIVATE KEY")) {
    return { ok: false, error: "No private_key in that file." };
  }

  return {
    ok: true,
    key: {
      client_email: k.client_email,
      // Keys pasted through a form often arrive with the newlines
      // escaped. Signing with those fails with an opaque OpenSSL error.
      private_key: k.private_key.replace(/\\n/g, "\n"),
      project_id: typeof k.project_id === "string" ? k.project_id : undefined,
      type: typeof k.type === "string" ? k.type : undefined,
    },
  };
}

/** Sign the assertion Google swaps for an access token. */
export function buildAssertion(
  key: ServiceAccountKey,
  now = Math.floor(Date.now() / 1000),
): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SERVICE_ACCOUNT_SCOPES.join(" "),
      aud: TOKEN_URL,
      // An hour is Google's maximum. Shorter buys nothing: the assertion
      // is exchanged immediately and never stored.
      exp: now + 3600,
      iat: now,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${b64url(signer.sign(key.private_key))}`;
}

/** Is a service account configured at all? */
export async function hasServiceAccount(): Promise<boolean> {
  const raw = await getSetting<string>(KEY_SETTING).catch(() => null);
  return Boolean(raw);
}

/** Who Google will see us as, for the "add this email" instructions. */
export async function serviceAccountEmail(): Promise<string | null> {
  const key = await loadKey();
  return key?.client_email ?? null;
}

async function loadKey(): Promise<ServiceAccountKey | null> {
  const raw = await getSetting<string>(KEY_SETTING).catch(() => null);
  if (!raw) return null;
  // Fail closed rather than handing ciphertext to the signer, which
  // would produce an unreadable OpenSSL error instead of a cause.
  const plain = decrypt(raw);
  if (!plain) return null;
  const parsed = parseServiceAccountKey(plain);
  return parsed.ok ? parsed.key : null;
}

/** Store a validated key, encrypted, and drop any token minted from the old one. */
export async function saveServiceAccountKey(
  raw: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const parsed = parseServiceAccountKey(raw);
  if (!parsed.ok) return parsed;
  await setSetting(KEY_SETTING, encrypt(JSON.stringify(parsed.key)));
  // A cached token from a previous key would keep working until it
  // expired, so the screen would say one account and the API calls would
  // use another.
  await Promise.all([
    deleteSetting(TOKEN_SETTING).catch(() => undefined),
    deleteSetting(TOKEN_EXPIRY_SETTING).catch(() => undefined),
  ]);
  return { ok: true, email: parsed.key.client_email };
}

export async function clearServiceAccount(): Promise<void> {
  await Promise.all([
    deleteSetting(KEY_SETTING).catch(() => undefined),
    deleteSetting(TOKEN_SETTING).catch(() => undefined),
    deleteSetting(TOKEN_EXPIRY_SETTING).catch(() => undefined),
  ]);
}

/**
 * An access token, from cache when it is still good.
 *
 * Returns null rather than throwing when no service account is set up,
 * because the caller's next move is to try OAuth instead.
 */
export async function serviceAccountAccessToken(): Promise<string | null> {
  const key = await loadKey();
  if (!key) return null;

  const [cachedRaw, expiresAt] = await Promise.all([
    getSetting<string>(TOKEN_SETTING).catch(() => null),
    getSetting<number>(TOKEN_EXPIRY_SETTING).catch(() => null),
  ]);
  const cached = cachedRaw ? decrypt(cachedRaw) : null;
  // Same 60s margin the OAuth path uses, for the same reason: a token
  // that expires mid-request fails in a way that looks like a bad token.
  if (cached && (expiresAt ?? 0) - 60_000 > Date.now()) return cached;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: JWT_GRANT,
      assertion: buildAssertion(key),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Google refused the service account (${res.status}). ${describeTokenError(body)}`,
    );
  }

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error("Google returned no access token for the service account.");
  }

  await Promise.all([
    setSetting(TOKEN_SETTING, encrypt(json.access_token)),
    setSetting(
      TOKEN_EXPIRY_SETTING,
      Date.now() + (json.expires_in ?? 3600) * 1000,
    ),
  ]);
  return json.access_token;
}

/**
 * Turn Google's token-endpoint errors into the thing to go and do.
 *
 * These are the two that actually happen during setup, and both of them
 * are opaque in Google's wording. "invalid_grant" in particular reads as
 * a broken key when it usually means the machine clock is off.
 */
export function describeTokenError(body: string): string {
  if (body.includes("invalid_grant")) {
    return "This usually means the server clock is wrong by more than a few minutes, or the key has been deleted in Google Cloud.";
  }
  if (body.includes("invalid_client") || body.includes("unauthorized_client")) {
    return "The service account exists but is not authorised. Check the key was not deleted, and that the Search Console API is enabled on its project.";
  }
  if (body.includes("invalid_scope")) {
    return "The project is missing an API. Enable the Search Console API and the Google Analytics Data API.";
  }
  return body.slice(0, 300);
}
