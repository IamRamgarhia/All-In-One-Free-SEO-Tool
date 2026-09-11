/**
 * The service account path, which is the easier way to connect Google.
 *
 * The assertion is the part worth testing hardest. A JWT that is merely
 * well-shaped gets a 400 from Google saying "invalid_grant", which is
 * the same thing it says when the server clock is wrong and when the key
 * has been deleted. So an unverified signature would be indistinguishable
 * from two unrelated problems, and the setup guide would get blamed.
 *
 * These verify the signature against a real key pair rather than
 * checking it has three dot-separated parts.
 */

import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildAssertion,
  describeTokenError,
  parseServiceAccountKey,
  SERVICE_ACCOUNT_SCOPES,
  type ServiceAccountKey,
} from "./google-service-account";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const key: ServiceAccountKey = {
  client_email: "seo-tool@example-project.iam.gserviceaccount.com",
  private_key: privateKey,
  project_id: "example-project",
  type: "service_account",
};

function parts(jwt: string) {
  const [h, c, s] = jwt.split(".");
  const un = (v: string) =>
    JSON.parse(Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  return { header: un(h), claims: un(c), signed: `${h}.${c}`, signature: s };
}

describe("the signed assertion", () => {
  it("verifies against the key that signed it", () => {
    const { signed, signature } = parts(buildAssertion(key));
    const v = createVerify("RSA-SHA256");
    v.update(signed);
    v.end();
    expect(
      v.verify(publicKey, Buffer.from(signature, "base64url")),
      "Google rejects an unverifiable assertion with the same error it uses for a wrong clock",
    ).toBe(true);
  });

  it("does not verify against a different key", () => {
    // Guards the guard. A verify that always returns true proves nothing.
    const other = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const { signed, signature } = parts(buildAssertion(key));
    const v = createVerify("RSA-SHA256");
    v.update(signed);
    v.end();
    expect(v.verify(other.publicKey, Buffer.from(signature, "base64url"))).toBe(
      false,
    );
  });

  it("claims what Google requires, and nothing it cannot grant", () => {
    const { header, claims } = parts(buildAssertion(key, 1_000_000));
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claims.iss).toBe(key.client_email);
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.iat).toBe(1_000_000);
    expect(claims.exp).toBe(1_000_000 + 3600);
    expect(claims.scope).toBe(SERVICE_ACCOUNT_SCOPES.join(" "));
    // A plain service account cannot hold these. Asking anyway yields a
    // token that looks fine and 403s on use, which reads as a broken
    // feature rather than a login that cannot do that.
    expect(claims.scope).not.toContain("business.manage");
    expect(claims.scope).not.toContain("gmail");
  });

  it("is base64url, not base64", () => {
    // A single + or / in the encoding makes Google reject the whole
    // assertion, and it only happens for some keys, so it would pass in
    // testing and fail for a user.
    expect(buildAssertion(key)).not.toMatch(/[+/=]/);
  });
});

describe("reading the pasted key file", () => {
  it("accepts a real key file", () => {
    const r = parseServiceAccountKey(JSON.stringify(key));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.key.client_email).toBe(key.client_email);
  });

  it("un-escapes newlines in the private key", () => {
    // Keys pasted through a form arrive with literal backslash-n. Signing
    // with those fails inside OpenSSL with a message naming nothing.
    const escaped = JSON.stringify({
      ...key,
      private_key: key.private_key.replace(/\n/g, "\\n"),
    });
    const r = parseServiceAccountKey(escaped);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.key.private_key).toContain("\n");
      expect(r.key.private_key).not.toContain("\\n");
      // And it must actually sign, which is the point of the un-escaping.
      expect(() => buildAssertion(r.key)).not.toThrow();
    }
  });

  it("names the OAuth client secret file when that gets pasted instead", () => {
    // The likeliest wrong paste, from the same console page, and
    // otherwise a baffling error.
    const r = parseServiceAccountKey(
      JSON.stringify({ installed: { client_id: "x", client_secret: "y" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/OAuth client secret/i);
  });

  it("rejects what is missing, and says which", () => {
    for (const [input, wanted] of [
      ["", /Paste/i],
      ["not json", /valid JSON/i],
      [JSON.stringify({ private_key: key.private_key }), /client_email/],
      [JSON.stringify({ client_email: "a@b.com" }), /private_key/],
    ] as const) {
      const r = parseServiceAccountKey(input);
      expect(r.ok, input.slice(0, 30)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(wanted);
    }
  });
});

describe("explaining Google's token errors", () => {
  it("points at the clock for invalid_grant", () => {
    // The error that looks most like a bad key and almost never is.
    expect(describeTokenError('{"error":"invalid_grant"}')).toMatch(/clock/i);
  });

  it("points at the missing API for invalid_scope", () => {
    expect(describeTokenError('{"error":"invalid_scope"}')).toMatch(/API/);
  });

  it("passes through anything it does not recognise", () => {
    // Better a raw Google error than a confident wrong explanation.
    expect(describeTokenError('{"error":"something_new"}')).toContain(
      "something_new",
    );
  });
});
