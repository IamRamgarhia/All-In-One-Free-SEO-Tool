import { describe, expect, it } from "vitest";
import { psiBodyFailure, psiHttpFailure, psiNetworkFailure } from "./psi-error";

/**
 * PageSpeed failures, from real response bodies.
 *
 * A user ran the Core Web Vitals tool and got this, verbatim, in a red
 * box on screen:
 *
 *   PSI 429: { "error": { "code": 429, "message": "Quota exceeded for
 *   quota metric 'Queries' and limit 'Queries per day' of service
 *   'pagespeedonline.googleapis.com' for consumer
 *   'project_number:583797351'
 *
 * Every part of that is wrong to show somebody: it is Google's own
 * shared anonymous project, not theirs; it does not say a free key fixes
 * it; and it appeared on a tool named "no PSI key" that has a local mode
 * needing no key at all.
 *
 * Fixtures, per the standing rule — a third party's error shapes change
 * without notice and the failure is always silent.
 */

const QUOTA_429 = JSON.stringify({
  error: {
    code: 429,
    message:
      "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' " +
      "of service 'pagespeedonline.googleapis.com' for consumer " +
      "'project_number:583797351'.",
    status: "RESOURCE_EXHAUSTED",
  },
});

const BAD_KEY_403 = JSON.stringify({
  error: {
    code: 403,
    message: "API key not valid. Please pass a valid API key.",
    status: "PERMISSION_DENIED",
  },
});

const BAD_URL_400 = JSON.stringify({
  error: {
    code: 400,
    message:
      "Lighthouse returned error: ERRORED_DOCUMENT_REQUEST. Required " +
      "(https://example.invalid/)",
    status: "INVALID_ARGUMENT",
  },
});

describe("nothing from Google reaches the user verbatim", () => {
  for (const [name, status, body] of [
    ["quota 429", 429, QUOTA_429],
    ["bad key 403", 403, BAD_KEY_403],
    ["bad url 400", 400, BAD_URL_400],
    ["server 503", 503, ""],
  ] as const) {
    it(`${name} produces prose, not JSON`, () => {
      const f = psiHttpFailure(status, body);
      expect(f.message).not.toMatch(/[{}]|project_number|quota metric|"code"/);
      // A sentence, not a code.
      expect(f.message.length).toBeGreaterThan(30);
      expect(f.message).toMatch(/[.!]$/);
    });
  }
});

describe("the quota case says the thing that actually helps", () => {
  it("names the free key and the fact that the allowance is shared", () => {
    const f = psiHttpFailure(429, QUOTA_429);
    expect(f.message).toMatch(/free/i);
    expect(f.message).toMatch(/shares?|shared/i);
    expect(f.fixHref).toBe("/settings#ai");
    expect(f.fixLabel).toBeTruthy();
  });

  it("a 403 that is really a quota problem is treated as one", () => {
    // Google answers 403 for per-minute limits on some projects. Reading
    // only the status code would send the user to check a key that is
    // fine.
    const f = psiHttpFailure(403, "Rate limit exceeded for this project.");
    expect(f.message).toMatch(/used up|allowance/i);
    expect(f.retryLocally).toBe(true);
  });

  it("a genuinely bad key sends you to the key, not to quota", () => {
    const f = psiHttpFailure(403, BAD_KEY_403);
    expect(f.message).toMatch(/rejected|wrong key/i);
    expect(f.fixHref).toBe("/settings#ai");
  });
});

describe("retryLocally only where local would actually help", () => {
  it("quota, auth and outage are all worth retrying locally", () => {
    expect(psiHttpFailure(429, QUOTA_429).retryLocally).toBe(true);
    expect(psiHttpFailure(403, BAD_KEY_403).retryLocally).toBe(true);
    expect(psiHttpFailure(503).retryLocally).toBe(true);
    expect(psiNetworkFailure(new Error("fetch failed")).retryLocally).toBe(true);
  });

  it("a URL Google could not load is NOT", () => {
    // Our browser would fail on it too. Retrying would burn 20 seconds
    // and then show the same person a second, differently-worded
    // failure.
    expect(psiHttpFailure(400, BAD_URL_400).retryLocally).toBe(false);
  });
});

describe("a 200 carrying an error object is treated like the status", () => {
  it("routes through the same classifier", () => {
    const viaBody = psiBodyFailure(JSON.parse(QUOTA_429));
    const viaStatus = psiHttpFailure(429, QUOTA_429);
    expect(viaBody.message).toBe(viaStatus.message);
  });

  it("an error object with no code still says something usable", () => {
    const f = psiBodyFailure({ error: { message: "something went wrong" } });
    expect(f.message).toMatch(/PageSpeed/);
    expect(f.message).not.toMatch(/something went wrong/);
  });
});

describe("network failures are distinguished", () => {
  it("a timeout says so and points at local mode", () => {
    const f = psiNetworkFailure(new Error("The operation was aborted"));
    expect(f.message).toMatch(/too long|patient/i);
  });

  it("being offline says that instead", () => {
    const f = psiNetworkFailure(new Error("getaddrinfo ENOTFOUND"));
    expect(f.message).toMatch(/reach|connection/i);
  });
});
